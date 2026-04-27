import datetime
import uuid
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, UploadFile
from beaverhabits.logger import logger
from pydantic import BaseModel

from beaverhabits.app import crud as auth_crud
from beaverhabits.app.db import User
from beaverhabits.app.dependencies import current_active_user
from beaverhabits.configs import settings
from beaverhabits.core.completions import CStatus, get_habit_date_completion
from beaverhabits.storage import get_user_dict_storage
from beaverhabits.storage.dict import DictHabitList
from beaverhabits.storage.storage import (
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


@api_router.get("/habits/meta", tags=["habits"])
async def get_habits_meta(
    habit_list: HabitList = Depends(current_habit_list),
):
    return HabitListMeta(order=habit_list.order)


@api_router.put("/habits/meta", tags=["habits"])
async def put_habits_meta(
    meta: HabitListMeta,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    if meta.order is not None:
        habit_list.order = meta.order
    await _storage.save_user_habit_list(user, habit_list)
    return {"order": habit_list.order}


@api_router.get("/habits", tags=["habits"])
async def get_habits(
    status: HabitStatus = HabitStatus.ACTIVE,
    habit_list: HabitList = Depends(current_habit_list),
):
    habits = HabitListBuilder(habit_list).status(status).build()
    return [{"id": x.id, "name": x.name, "tags": x.tags or []} for x in habits]


class CreateHabit(BaseModel):
    name: str
    tags: list[str] | None = None


@api_router.post("/habits", tags=["habits"])
async def post_habits(
    habit: CreateHabit,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)

    id = await habit_list.add(habit.name)
    logger.info(f"Created new habit {id} for user {user.email}")

    if habit.tags:
        created = await habit_list.get_habit_by(id)
        if created is not None:
            created.tags = habit.tags

    await _storage.save_user_habit_list(user, habit_list)
    return {"id": id, "name": habit.name, "tags": habit.tags or []}


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
        existing_habit.period = HabitFrequency(
            target_count=habit.period.target_count,
            period_count=habit.period.period_count,
            period_type=habit.period.period_type,
        )
    if habit.tags is not None:
        existing_habit.tags = habit.tags

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
    done: bool
    date: str
    text: str | None = None
    date_fmt: str = "%d-%m-%Y"


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
    await habit.tick(day, tick.done, tick.text)
    await _storage.save_user_habit_list(user, habit_list)
    return {"day": day.strftime(tick.date_fmt), "done": tick.done}


@api_router.get("/habits/{habit_id}/stats", tags=["habits"])
async def get_habit_stats(
    habit_id: str,
    user: User = Depends(current_active_user),
):
    habit = await _get_user_habit(user, habit_id)
    today = datetime.date.today()
    done_dates = sorted(
        (r.day for r in habit.records if r.done),
        reverse=True,
    )
    done_set = set(done_dates)

    streak = 0
    cursor = today
    while cursor in done_set:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    def percent(window_days: int) -> float:
        cutoff = today - datetime.timedelta(days=window_days)
        hits = sum(1 for d in done_dates if cutoff <= d <= today)
        return round(hits / window_days * 100, 1)

    return {
        "streak": streak,
        "total": len(done_dates),
        "percent_30d": percent(30),
        "percent_90d": percent(90),
    }


@api_router.get("/habits/{habit_id}/heatmap", tags=["habits"])
async def get_habit_heatmap(
    habit_id: str,
    years: int = Query(1, ge=1, le=10),
    user: User = Depends(current_active_user),
):
    habit = await _get_user_habit(user, habit_id)
    today = datetime.date.today()
    done_set = {r.day for r in habit.records if r.done}

    out_years = []
    for offset in range(years):
        year = today.year - offset
        first = datetime.date(year, 1, 1)
        last = datetime.date(year, 12, 31)
        days = []
        cursor = first
        while cursor <= last:
            days.append({
                "date": cursor.isoformat(),
                "done": cursor in done_set,
            })
            cursor += datetime.timedelta(days=1)
        out_years.append({"year": year, "days": days})

    return {"years": out_years}


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


@api_router.get("/tokens", tags=["tokens"])
async def get_token(user: User = Depends(current_active_user)):
    token = await auth_crud.get_user_api_token(user)
    return {"token": token}


@api_router.post("/tokens", tags=["tokens"])
async def create_token(user: User = Depends(current_active_user)):
    token = await auth_crud.create_user_api_token(user)
    return {"token": token}


@api_router.delete("/tokens", tags=["tokens"], status_code=204)
async def delete_token(user: User = Depends(current_active_user)):
    await auth_crud.delete_user_api_token(user)


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
    from beaverhabits.utils import generate_short_hash

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
    return {"day": day, "done": bool(r.done), "text": getattr(r, "text", "") or ""}


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
    }


def init_api_routes(app: FastAPI) -> None:
    app.include_router(api_router, prefix="/api/v1")
