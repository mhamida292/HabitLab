import datetime
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, UploadFile
from habitlab.logger import logger
from pydantic import BaseModel

from habitlab.auth import current_active_user
from habitlab.models import User
from habitlab.configs import settings
from habitlab.core.completions import CStatus, get_habit_date_completion
from habitlab.storage import get_user_dict_storage
from habitlab.storage.dict import DictHabitList
from habitlab.storage.storage import (
    Habit,
    HabitFrequency,
    HabitList,
    HabitListBuilder,
    HabitStatus,
)

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

api_router = APIRouter()

_storage = get_user_dict_storage()


async def _get_or_create_habit_list(user: User) -> HabitList:
    """Return the user's habit list, auto-creating it if it doesn't exist yet."""
    try:
        return await _storage.get_user_habit_list(user)
    except Exception:
        pass

    # First visit — create an empty habit list
    empty = DictHabitList({"habits": []})
    await _storage.init_user_habit_list(user, empty)
    return await _storage.get_user_habit_list(user)


async def current_habit_list(user: User = Depends(current_active_user)) -> HabitList:
    return await _get_or_create_habit_list(user)


async def _get_user_habit(user: User, habit_id: str) -> Habit:
    habit_list = await _get_or_create_habit_list(user)
    habit = await habit_list.get_habit_by(habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    return habit


class HabitListMeta(BaseModel):
    order: list[str] | None = None
    pinned_today_ids: list[str] | None = None


@api_router.get("/habits/meta", tags=["habits"])
async def get_habits_meta(
    habit_list: HabitList = Depends(current_habit_list),
):
    return HabitListMeta(
        order=habit_list.order,
        pinned_today_ids=habit_list.today_pinned,
    )


@api_router.put("/habits/meta", tags=["habits"])
async def put_habits_meta(
    meta: HabitListMeta,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    if meta.order is not None:
        habit_list.order = meta.order
    if meta.pinned_today_ids is not None:
        habit_list.today_pinned = meta.pinned_today_ids
    await _storage.save_user_habit_list(user, habit_list)
    return {
        "order": habit_list.order,
        "pinned_today_ids": habit_list.today_pinned,
    }


@api_router.get("/habits", tags=["habits"])
async def get_habits(
    status: HabitStatus = HabitStatus.ACTIVE,
    habit_list: HabitList = Depends(current_habit_list),
):
    habits = HabitListBuilder(habit_list).status(status).build()
    out = []
    for x in habits:
        period = x.period
        out.append({
            "id": x.id,
            "name": x.name,
            "tags": x.tags or [],
            "icon": x.icon,
            "target_count": x.target_count,
            "period": (
                {
                    "target_count": period.target_count,
                    "period_count": period.period_count,
                    "period_type": period.period_type,
                }
                if period is not None
                else None
            ),
            "sub_goals": x.sub_goals,
            "sub_goal_unit": x.sub_goal_unit,
            "records": [
                {
                    "day": r.day.strftime("%Y-%m-%d"),
                    "done": r.done,
                    "count": r.count,
                    "sub_goals_done": r.sub_goals_done,
                }
                for r in x.records
            ],
        })
    return out


class CreateHabit(BaseModel):
    name: str
    tags: list[str] | None = None
    icon: str | None = None
    target_count: int | None = None
    date_started: str | None = None  # ISO YYYY-MM-DD; defaults to today


@api_router.post("/habits", tags=["habits"])
async def post_habits(
    habit: CreateHabit,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)

    id = await habit_list.add(habit.name)
    logger.info(f"Created new habit {id} for user {user.id}")

    created = await habit_list.get_habit_by(id)
    if created is not None:
        if habit.tags:
            created.tags = habit.tags
        if habit.icon:
            created.icon = habit.icon
        if habit.target_count and habit.target_count > 0:
            created.target_count = habit.target_count
        if habit.date_started:
            try:
                created.date_started = datetime.date.fromisoformat(habit.date_started)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date_started format")
        else:
            created.date_started = datetime.date.today()

    await _storage.save_user_habit_list(user, habit_list)
    return {
        "id": id,
        "name": habit.name,
        "tags": habit.tags or [],
        "icon": (created.icon if created else "📌"),
        "target_count": (created.target_count if created else 1),
        "date_started": (created.date_started.isoformat() if created else datetime.date.today().isoformat()),
    }


@api_router.get("/habits/{habit_id}", tags=["habits"])
async def get_habit_detail(
    habit_id: str,
    user: User = Depends(current_active_user),
):
    habit = await _get_user_habit(user, habit_id)
    return format_json_response(habit)


class UpdateHabit(BaseModel):
    class UpdateHabitPeriod(BaseModel):
        period_type: Literal["D", "W", "M", "Y"]
        period_count: int
        target_count: int

    name: str | None = None
    star: bool | None = None
    status: HabitStatus | None = None
    period: UpdateHabitPeriod | None = None
    tags: list[str] | None = None
    icon: str | None = None
    target_count: int | None = None
    date_started: str | None = None
    sub_goals: list[dict] | None = None       # [{id, name}, ...]
    sub_goal_unit: str | None = None


@api_router.put("/habits/{habit_id}", tags=["habits"])
async def put_habit(
    habit_id: str,
    habit: UpdateHabit,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    existing_habit = await habit_list.get_habit_by(habit_id)
    if existing_habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    if habit.name is not None:
        existing_habit.name = habit.name
    if habit.star is not None:
        existing_habit.star = habit.star
    if habit.status is not None:
        existing_habit.status = habit.status
    if habit.period is not None:
        if habit.period.target_count <= 1 and habit.period.period_type == "D":
            existing_habit.period = None
        else:
            existing_habit.period = HabitFrequency(
                target_count=habit.period.target_count,
                period_count=habit.period.period_count,
                period_type=habit.period.period_type,
            )
    if habit.tags is not None:
        existing_habit.tags = habit.tags
    if habit.icon is not None:
        existing_habit.icon = habit.icon
    if habit.target_count is not None and habit.target_count > 0:
        existing_habit.target_count = habit.target_count
    if habit.date_started is not None:
        try:
            existing_habit.date_started = datetime.date.fromisoformat(habit.date_started)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date_started format")
    if habit.sub_goals is not None:
        existing_habit.sub_goals = habit.sub_goals
        if habit.sub_goals:
            existing_habit.target_count = len(habit.sub_goals)
    if habit.sub_goal_unit is not None:
        existing_habit.sub_goal_unit = habit.sub_goal_unit

    await _storage.save_user_habit_list(user, habit_list)
    return format_json_response(existing_habit)


@api_router.delete("/habits/{habit_id}", tags=["habits"])
async def delete_habit(
    habit_id: str,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    habit = await habit_list.get_habit_by(habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")
    await habit_list.remove(habit)
    await _storage.save_user_habit_list(user, habit_list)
    return format_json_response(habit)


@api_router.get("/habits/{habit_id}/completions", tags=["habits"])
async def get_habit_completions(
    habit_id: str,
    status: str | None = None,
    date_fmt: str = "%d-%m-%Y",
    date_start: str | None = None,
    date_end: str | None = None,
    limit: int | None = 10,
    sort="asc",
    user: User = Depends(current_active_user),
):
    # Parse date range
    start, end = datetime.date.min, datetime.date.max
    if date_start:
        try:
            start = datetime.datetime.strptime(date_start, date_fmt.strip()).date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    if date_end:
        try:
            end = datetime.datetime.strptime(date_end, date_fmt.strip()).date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    if start > end:
        raise HTTPException(
            status_code=400, detail="date_start cannot be after date_end"
        )

    # Parse status filter
    cstatus_list = [CStatus.DONE]
    if status:
        cstatus_list = []
        for s in status.split(","):
            try:
                cstatus_list.append(CStatus[s.strip().upper()])
            except KeyError:
                raise HTTPException(status_code=400, detail=f"Invalid status: {s}")

    habit = await _get_user_habit(user, habit_id)
    status_map = get_habit_date_completion(habit, start, end)
    ticked_days = [
        day
        for day, stat in status_map.items()
        if any(s in stat for s in cstatus_list) and start <= day <= end
    ]

    if sort not in ("asc", "desc"):
        raise HTTPException(status_code=400, detail="Invalid sort value")
    ticked_days = sorted(ticked_days, reverse=sort == "desc")

    if limit:
        ticked_days = ticked_days[:limit]

    return [x.strftime(date_fmt) for x in ticked_days]


class Tick(BaseModel):
    done: bool | None = None
    count: int | None = None
    date: str
    text: str | None = None
    date_fmt: str = "%d-%m-%Y"
    sub_goal_id: str | None = None  # if present, toggle this sub-goal only


@api_router.post("/habits/{habit_id}/completions", tags=["habits"])
async def put_habit_completions(
    habit_id: str,
    tick: Tick,
    user: User = Depends(current_active_user),
):
    try:
        day = datetime.datetime.strptime(tick.date, tick.date_fmt.strip()).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    habit_list = await _get_or_create_habit_list(user)
    habit = await habit_list.get_habit_by(habit_id)
    if habit is None:
        raise HTTPException(status_code=404, detail="Habit not found")

    if tick.sub_goal_id is not None:
        # Validate sub_goal_id belongs to this habit
        valid_ids = {sg["id"] for sg in habit.sub_goals}
        if tick.sub_goal_id not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Unknown sub_goal_id: {tick.sub_goal_id}")

        # Get existing record for this day (may not exist yet)
        existing_record = habit.ticked_data.get(day)
        if existing_record is not None:
            current_done = list(existing_record.sub_goals_done)
        else:
            current_done = []

        # Toggle
        if tick.sub_goal_id in current_done:
            current_done.remove(tick.sub_goal_id)
        else:
            current_done.append(tick.sub_goal_id)

        new_count = len(current_done)
        new_done = new_count >= len(habit.sub_goals)

        # tick() sets count + done on the record (creates if missing)
        record = await habit.tick(day, count=new_count)
        record.data["done"] = new_done
        record.data["sub_goals_done"] = current_done

        await _storage.save_user_habit_list(user, habit_list)
        return {
            "day": day.strftime(tick.date_fmt),
            "done": new_done,
            "count": new_count,
            "target_count": habit.target_count,
            "sub_goals_done": current_done,
        }

    record = await habit.tick(day, done=tick.done, text=tick.text, count=tick.count)
    await _storage.save_user_habit_list(user, habit_list)
    return {
        "day": day.strftime(tick.date_fmt),
        "done": record.done,
        "count": record.count,
        "target_count": habit.target_count,
    }


def _scoped_percent(
    done_dates: list[datetime.date],
    today: datetime.date,
    window_days: int,
    date_started: datetime.date,
) -> float:
    window_start = today - datetime.timedelta(days=window_days - 1)
    effective_start = max(window_start, date_started)
    denom = (today - effective_start).days + 1
    if denom <= 0:
        return 0.0
    hits = sum(1 for d in done_dates if effective_start <= d <= today)
    return round(hits / denom * 100, 1)


def _compute_habit_stats(habit, today: datetime.date) -> dict:
    target = habit.target_count
    done_dates = sorted(
        (r.day for r in habit.records if r.count >= target),
        reverse=True,
    )
    done_set = set(done_dates)

    streak = 0
    cursor = today
    while cursor in done_set:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    started = habit.date_started
    month_start = today.replace(day=1)
    monthly_checkins = sum(
        1 for r in habit.records if month_start <= r.day <= today and r.count >= target
    )

    sub_goals = habit.sub_goals or []
    effective_start = started

    if sub_goals:
        records_with_sg = [r for r in habit.records if r.day <= today and r.sub_goals_done]
        if records_with_sg:
            earliest_sg = min(r.day for r in records_with_sg)
            if earliest_sg < effective_start:
                effective_start = earliest_sg
        days_since_start = max(1, (today - effective_start).days + 1)
        total_sg_done = sum(len(r.sub_goals_done) for r in habit.records if r.day <= today)
        total_possible = len(sub_goals) * days_since_start
        all_time_rate = min(100.0, round(total_sg_done / total_possible * 100, 1))
    else:
        if done_dates:
            earliest_done = min(done_dates)
            if earliest_done < effective_start:
                effective_start = earliest_done
        days_since_start = max(1, (today - effective_start).days + 1)
        all_time_rate = min(100.0, round(len(done_dates) / days_since_start * 100, 1))

    return {
        "streak": streak,
        "total": len(done_dates),
        "percent_7d": _scoped_percent(done_dates, today, 7, started),
        "percent_30d": _scoped_percent(done_dates, today, 30, started),
        "percent_90d": _scoped_percent(done_dates, today, 90, started),
        "target_count": target,
        "date_started": started.isoformat(),
        "monthly_checkins": monthly_checkins,
        "all_time_rate": all_time_rate,
        "total_completion": sum(r.count for r in habit.records),
    }


def _parse_today(today: str | None) -> datetime.date:
    if today:
        try:
            return datetime.date.fromisoformat(today)
        except ValueError:
            pass
    return datetime.date.today()


@api_router.get("/habits/stats", tags=["habits"])
async def get_all_habits_stats(
    today: str | None = Query(None),
    habit_list: HabitList = Depends(current_habit_list),
):
    today_date = _parse_today(today)
    return {h.id: _compute_habit_stats(h, today_date) for h in habit_list.habits}


@api_router.get("/habits/{habit_id}/stats", tags=["habits"])
async def get_habit_stats(
    habit_id: str,
    today: str | None = Query(None, description="Client local date YYYY-MM-DD; falls back to server UTC if omitted"),
    user: User = Depends(current_active_user),
):
    habit = await _get_user_habit(user, habit_id)
    return _compute_habit_stats(habit, _parse_today(today))


@api_router.get("/habits/{habit_id}/heatmap", tags=["habits"])
async def get_habit_heatmap(
    habit_id: str,
    years: int = Query(1, ge=1, le=10),
    user: User = Depends(current_active_user),
):
    habit = await _get_user_habit(user, habit_id)
    target = habit.target_count
    today = datetime.date.today()
    counts_by_day = {r.day: r.count for r in habit.records}

    out_years = []
    for offset in range(years):
        year = today.year - offset
        first = datetime.date(year, 1, 1)
        last = datetime.date(year, 12, 31)
        days = []
        cursor = first
        while cursor <= last:
            cnt = counts_by_day.get(cursor, 0)
            days.append({
                "date": cursor.isoformat(),
                "count": cnt,
                "done": cnt >= target,
            })
            cursor += datetime.timedelta(days=1)
        out_years.append({"year": year, "days": days})

    return {"years": out_years, "target_count": target}


@api_router.post("/uploads", tags=["uploads"])
async def post_upload(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = ext_map[file.content_type]
    name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = Path(settings.DATA_DIR) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / name).write_bytes(contents)
    return {"url": f"/uploads/{name}"}



@api_router.get("/export", tags=["data"])
async def export_data(habit_list: HabitList = Depends(current_habit_list)):
    # DictHabitList exposes .data which is {"habits": [...]}
    return {"habits": habit_list.data.get("habits", [])}


@api_router.post("/import", tags=["data"])
async def import_data(
    payload: dict,
    user: User = Depends(current_active_user),
):
    habits = payload.get("habits")
    if not isinstance(habits, list):
        raise HTTPException(status_code=400, detail="Payload missing 'habits' list")
    habit_list = await _get_or_create_habit_list(user)
    habit_list.data["habits"] = habits
    await _storage.save_user_habit_list(user, habit_list)
    return {"ok": True, "count": len(habits)}


@api_router.post("/seed/sample-data", tags=["data"])
async def seed_sample_data(user: User = Depends(current_active_user)):
    """Populate the user's habit list with a few sample habits and recent ticks."""
    import random
    from habitlab.utils import generate_short_hash

    habit_list = await _get_or_create_habit_list(user)
    today = datetime.date.today()

    samples = [
        {"name": "Drink water", "tags": ["health"]},
        {"name": "Read 20 minutes", "tags": ["learning"]},
        {"name": "Exercise", "tags": ["health", "fitness"]},
        {"name": "Meditate", "tags": ["mindfulness"]},
        {"name": "Journal", "tags": ["mindfulness"]},
    ]

    rng = random.Random(42)
    new_habits = []
    for s in samples:
        records = []
        for offset in range(60):
            day = today - datetime.timedelta(days=offset)
            if rng.random() < 0.65:
                records.append({"day": day.strftime("%Y-%m-%d"), "done": True, "text": ""})
        new_habits.append({
            "id": generate_short_hash(s["name"] + str(rng.random())),
            "name": s["name"],
            "tags": s["tags"],
            "star": False,
            "status": "active",
            "date_started": datetime.date.today().isoformat(),
            "records": records,
        })

    habit_list.data["habits"] = (habit_list.data.get("habits") or []) + new_habits
    await _storage.save_user_habit_list(user, habit_list)
    return {"ok": True, "added": len(new_habits)}


def _record_to_dict(r) -> dict:
    try:
        day = r.day.isoformat()
    except Exception:
        day = r.data.get("day") if hasattr(r, "data") else None
    return {
        "day": day,
        "done": bool(r.done),
        "count": int(getattr(r, "count", 1 if r.done else 0)),
        "text": getattr(r, "text", "") or "",
        "sub_goals_done": getattr(r, "sub_goals_done", []),
    }


def format_json_response(habit: Habit) -> dict:
    period = habit.period
    period_out = None
    if period is not None:
        period_out = {
            "target_count": period.target_count,
            "period_count": period.period_count,
            "period_type": period.period_type,
        }
    return {
        "id": habit.id,
        "name": habit.name,
        "star": habit.star,
        "records": [_record_to_dict(r) for r in habit.records],
        "status": getattr(habit.status, "value", str(habit.status)),
        "period": period_out,
        "tags": habit.tags,
        "icon": habit.icon,
        "target_count": habit.target_count,
        "date_started": habit.date_started.isoformat(),
        "sub_goals": habit.sub_goals,
        "sub_goal_unit": habit.sub_goal_unit,
    }


# ── Notes ─────────────────────────────────────────────────────────────────────

class CreateNote(BaseModel):
    title: str
    body: str = ""
    habit_id: str | None = None
    created_at: str | None = None


class UpdateNote(BaseModel):
    title: str | None = None
    body: str | None = None
    habit_id: str | None = None


@api_router.get("/notes", tags=["notes"])
async def get_notes(
    habit_id: str | None = None,
    habit_list: HabitList = Depends(current_habit_list),
):
    notes = sorted(habit_list.notes, key=lambda n: n.get("created_at", ""), reverse=True)
    if habit_id:
        notes = [n for n in notes if n.get("habit_id") == habit_id]
    return notes


@api_router.post("/notes", tags=["notes"])
async def post_note(
    note: CreateNote,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    created = habit_list.add_note(note.title, note.body, note.habit_id, note.created_at)
    await _storage.save_user_habit_list(user, habit_list)
    return created


@api_router.put("/notes/{note_id}", tags=["notes"])
async def put_note(
    note_id: str,
    note: UpdateNote,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    existing = habit_list.get_note(note_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.title is not None:
        existing["title"] = note.title.strip() or "Untitled"
    if note.body is not None:
        existing["body"] = note.body
    if note.habit_id is not None:
        existing["habit_id"] = note.habit_id if note.habit_id != "" else None
    await _storage.save_user_habit_list(user, habit_list)
    return existing


@api_router.delete("/notes/{note_id}", tags=["notes"])
async def delete_note_route(
    note_id: str,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    deleted = habit_list.delete_note(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    await _storage.save_user_habit_list(user, habit_list)
    return {"ok": True}


# ── Tasks ─────────────────────────────────────────────────────────────────────

class CreateTask(BaseModel):
    text: str
    date: str  # YYYY-MM-DD


class UpdateTask(BaseModel):
    done: bool | None = None
    text: str | None = None


@api_router.get("/tasks", tags=["tasks"])
async def get_tasks(
    date: str = Query(..., description="YYYY-MM-DD"),
    carry: bool = Query(False),
    habit_list: HabitList = Depends(current_habit_list),
):
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date; use YYYY-MM-DD")
    return habit_list.get_tasks(date, carry=carry)


@api_router.post("/tasks", tags=["tasks"])
async def post_task(
    task: CreateTask,
    user: User = Depends(current_active_user),
):
    try:
        datetime.date.fromisoformat(task.date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date; use YYYY-MM-DD")
    if not task.text.strip():
        raise HTTPException(status_code=422, detail="Task text cannot be empty")
    habit_list = await _get_or_create_habit_list(user)
    created = habit_list.add_task(task.text, task.date)
    await _storage.save_user_habit_list(user, habit_list)
    return created


@api_router.patch("/tasks/{task_id}", tags=["tasks"])
async def patch_task(
    task_id: str,
    task: UpdateTask,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    updated = habit_list.update_task(task_id, **task.model_dump(exclude_none=True))
    if updated is None:
        raise HTTPException(status_code=404, detail="Task not found")
    await _storage.save_user_habit_list(user, habit_list)
    return updated


@api_router.delete("/tasks/{task_id}", tags=["tasks"])
async def delete_task_route(
    task_id: str,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    deleted = habit_list.delete_task(task_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Task not found")
    await _storage.save_user_habit_list(user, habit_list)
    return {"ok": True}


def init_api_routes(app: FastAPI) -> None:
    app.include_router(api_router, prefix="/api/v1")
