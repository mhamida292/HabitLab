# HabitLab — TickTick Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full frontend overhaul to TickTick-style split-panel layout with sub-goals, monthly circle calendar, and new blue design system — keeping `api.js` and all FastAPI routes intact.

**Architecture:** Nav rail (46px) + fixed list panel (340px) + flex detail panel. Dynamic detail rendered by `habits.js`. Sub-goals stored as JSON in existing dict blob; completions extended with `sub_goals_done`. Monthly circle calendar in new `monthly.js`.

**Tech Stack:** Vanilla JS ES modules, CSS variables, SVG (line chart + progress rings), existing FastAPI/Jinja2 backend, SortableJS (already vendored at `statics/libs/sortable.min.js`).

**Reference spec:** `docs/superpowers/specs/2026-05-24-ticktick-redesign.md`

---

## Phase 1 — Backend: sub-goals data model

### Task 1.1: Extend storage layer — `sub_goals_done` on DictRecord + `sub_goals`/`sub_goal_unit` on DictHabit

**Files:**
- Modify: `beaverhabits/storage/dict.py`
- Test: `tests/test_storage.py` (extend)

- [ ] **Step 1: Write failing test**

```python
# add to tests/test_storage.py
import pytest
from beaverhabits.storage.dict import DictHabitList, DictHabit
import datetime

def make_habit(name="Salah", sub_goals=None):
    sub_goals = sub_goals or [
        {"id": "fajr", "name": "Fajr"},
        {"id": "dhuhr", "name": "Dhuhr"},
    ]
    hl_data = {"habits": [], "order": []}
    hl = DictHabitList(hl_data)
    data = {"name": name, "records": [], "id": "test1", "tags": [], "sub_goals": sub_goals, "sub_goal_unit": "prayers"}
    return DictHabit(data, hl)

def test_sub_goals_property():
    h = make_habit()
    assert h.sub_goals == [{"id": "fajr", "name": "Fajr"}, {"id": "dhuhr", "name": "Dhuhr"}]
    assert h.sub_goal_unit == "prayers"

def test_sub_goals_default_empty():
    hl_data = {"habits": [], "order": []}
    hl = DictHabitList(hl_data)
    data = {"name": "Regular", "records": [], "id": "r1", "tags": []}
    h = DictHabit(data, hl)
    assert h.sub_goals == []
    assert h.sub_goal_unit == "items"

def test_sub_goals_done_on_record():
    h = make_habit()
    day = datetime.date(2026, 5, 24)
    import asyncio
    asyncio.run(h.tick(day, count=1))
    record = h.ticked_data[day]
    record.data["sub_goals_done"] = ["fajr"]
    assert record.sub_goals_done == ["fajr"]
    record.sub_goals_done = ["fajr", "dhuhr"]
    assert record.data["sub_goals_done"] == ["fajr", "dhuhr"]
```

- [ ] **Step 2: Run test to verify failure**

```bash
cd /home/mhamida/Desktop/Projects/Software\ Dev/habitlab
uv run pytest tests/test_storage.py::test_sub_goals_property tests/test_storage.py::test_sub_goals_default_empty tests/test_storage.py::test_sub_goals_done_on_record -v
```
Expected: FAIL — `DictHabit` has no `sub_goals` attribute.

- [ ] **Step 3: Add properties to `DictRecord`**

In `beaverhabits/storage/dict.py`, inside class `DictRecord`, after the `count` setter (line ~73), add:

```python
    @property
    def sub_goals_done(self) -> list[str]:
        return self.data.get("sub_goals_done", [])

    @sub_goals_done.setter
    def sub_goals_done(self, value: list[str]) -> None:
        self.data["sub_goals_done"] = list(value)
```

- [ ] **Step 4: Add properties to `DictHabit`**

Inside class `DictHabit`, after the `chips` setter (line ~212), add:

```python
    @property
    def sub_goals(self) -> list[dict]:
        return self.data.get("sub_goals", [])

    @sub_goals.setter
    def sub_goals(self, value: list[dict]) -> None:
        self.data["sub_goals"] = list(value)

    @property
    def sub_goal_unit(self) -> str:
        return self.data.get("sub_goal_unit", "items")

    @sub_goal_unit.setter
    def sub_goal_unit(self, value: str) -> None:
        self.data["sub_goal_unit"] = value or "items"
```

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_storage.py::test_sub_goals_property tests/test_storage.py::test_sub_goals_default_empty tests/test_storage.py::test_sub_goals_done_on_record -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add beaverhabits/storage/dict.py tests/test_storage.py
git commit -m "feat(storage): add sub_goals/sub_goal_unit on DictHabit; sub_goals_done on DictRecord"
```

---

### Task 1.2: Extend API — UpdateHabit model + PUT handler + format_json_response

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_apis.py` (extend)

- [ ] **Step 1: Write failing test**

```python
# add to tests/test_apis.py
@pytest.mark.asyncio
async def test_put_habit_sub_goals(authed_client, habit):
    sub_goals = [
        {"id": "fajr", "name": "Fajr"},
        {"id": "dhuhr", "name": "Dhuhr"},
        {"id": "asr", "name": "Asr"},
    ]
    resp = await authed_client.put(
        f"/api/v1/habits/{habit.id}",
        json={"sub_goals": sub_goals, "sub_goal_unit": "prayers"},
    )
    assert resp.status_code == 200

    get = await authed_client.get(f"/api/v1/habits/{habit.id}")
    body = get.json()
    assert body["sub_goals"] == sub_goals
    assert body["sub_goal_unit"] == "prayers"

@pytest.mark.asyncio
async def test_get_habits_includes_sub_goals(authed_client, habit):
    resp = await authed_client.get("/api/v1/habits")
    habits = resp.json()
    found = next(h for h in habits if h["id"] == habit.id)
    assert "sub_goals" in found
    assert "sub_goal_unit" in found
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_apis.py::test_put_habit_sub_goals tests/test_apis.py::test_get_habits_includes_sub_goals -v
```
Expected: FAIL.

- [ ] **Step 3: Extend `UpdateHabit` model**

In `beaverhabits/routes/api.py`, in the `UpdateHabit` class (line ~163), add two fields:

```python
    sub_goals: list[dict] | None = None       # [{id, name}, ...]
    sub_goal_unit: str | None = None
```

- [ ] **Step 4: Extend `put_habit` handler**

In `put_habit` (line ~180), after the existing `if habit.tags is not None:` block, add:

```python
    if habit_update.sub_goals is not None:
        existing_habit.sub_goals = habit_update.sub_goals
        # When adding sub_goals, set target_count to match their count
        if habit_update.sub_goals:
            existing_habit.target_count = len(habit_update.sub_goals)
    if habit_update.sub_goal_unit is not None:
        existing_habit.sub_goal_unit = habit_update.sub_goal_unit
```

(Check the local variable name for the incoming `UpdateHabit` body — it's `habit` in the current code. Rename the `habit` parameter to `habit_update` in the function signature to avoid shadowing `existing_habit`.)

- [ ] **Step 5: Extend `format_json_response`**

In `format_json_response` (line ~516), inside the return dict, add after `"target_count"`:

```python
        "sub_goals": habit.sub_goals,
        "sub_goal_unit": habit.sub_goal_unit,
```

- [ ] **Step 6: Extend `_record_to_dict`**

In `_record_to_dict` (line ~503), add after `"text"`:

```python
        "sub_goals_done": getattr(r, "sub_goals_done", []),
```

- [ ] **Step 7: Run tests**

```bash
uv run pytest tests/test_apis.py::test_put_habit_sub_goals tests/test_apis.py::test_get_habits_includes_sub_goals -v
```
Expected: PASS.

- [ ] **Step 8: Run full test suite**

```bash
uv run pytest tests/ --ignore=tests/e2e -q
```
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_apis.py
git commit -m "feat(api): extend UpdateHabit and format_json_response with sub_goals fields"
```

---

### Task 1.3: Extend Tick model + completions handler for sub-goal toggle

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_apis.py` (extend)

- [ ] **Step 1: Write failing test**

```python
# add to tests/test_apis.py
@pytest.mark.asyncio
async def test_tick_sub_goal_id_toggles_sub_goals_done(authed_client, habit):
    # First give the habit sub_goals
    sub_goals = [{"id": "fajr", "name": "Fajr"}, {"id": "dhuhr", "name": "Dhuhr"}]
    await authed_client.put(f"/api/v1/habits/{habit.id}", json={"sub_goals": sub_goals})

    today = datetime.date.today().strftime("%Y-%m-%d")

    # Tick fajr
    resp = await authed_client.post(
        f"/api/v1/habits/{habit.id}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "fajr"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "fajr" in body["sub_goals_done"]
    assert body["count"] == 1
    assert body["done"] is False  # only 1 of 2 done

    # Tick dhuhr — now both done
    resp2 = await authed_client.post(
        f"/api/v1/habits/{habit.id}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "dhuhr"},
    )
    body2 = resp2.json()
    assert body2["done"] is True
    assert body2["count"] == 2

    # Untick fajr
    resp3 = await authed_client.post(
        f"/api/v1/habits/{habit.id}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "fajr"},
    )
    body3 = resp3.json()
    assert "fajr" not in body3["sub_goals_done"]
    assert body3["count"] == 1
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_apis.py::test_tick_sub_goal_id_toggles_sub_goals_done -v
```
Expected: FAIL.

- [ ] **Step 3: Extend `Tick` model**

In `beaverhabits/routes/api.py`, in class `Tick` (line ~290):

```python
class Tick(BaseModel):
    done: bool | None = None
    count: int | None = None
    date: str
    text: str | None = None
    date_fmt: str = "%d-%m-%Y"
    sub_goal_id: str | None = None   # ← add this
```

- [ ] **Step 4: Extend `put_habit_completions` handler**

In `put_habit_completions` (line ~299), after parsing `day` and fetching `habit`, add a branch **before** the existing `record = await habit.tick(...)` call:

```python
    if tick.sub_goal_id is not None:
        # Validate sub_goal_id belongs to this habit
        valid_ids = {sg["id"] for sg in habit.sub_goals}
        if tick.sub_goal_id not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Unknown sub_goal_id: {tick.sub_goal_id}")

        # Get or create record for this day
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
    # Existing path continues below unchanged...
```

(Place this block before the existing `record = await habit.tick(...)` line.)

- [ ] **Step 5: Run tests**

```bash
uv run pytest tests/test_apis.py::test_tick_sub_goal_id_toggles_sub_goals_done -v
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_apis.py
git commit -m "feat(api): extend Tick with sub_goal_id; toggle sub-goals in completions handler"
```

---

### Task 1.4: Extend `/stats` endpoint with monthly metrics

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_stats.py` (extend)

- [ ] **Step 1: Write failing test**

```python
# add to tests/test_stats.py
import datetime

@pytest.mark.asyncio
async def test_stats_includes_monthly_metrics(authed_client, habit):
    resp = await authed_client.get(f"/api/v1/habits/{habit.id}/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert "monthly_checkins" in body
    assert "monthly_checkin_rate" in body
    assert "monthly_completion" in body
    assert "total_completion" in body
    # All zero for a fresh habit
    assert body["monthly_checkins"] == 0
    assert body["monthly_completion"] == 0
    assert body["total_completion"] == 0
    assert 0.0 <= body["monthly_checkin_rate"] <= 100.0
```

- [ ] **Step 2: Run to verify failure**

```bash
uv run pytest tests/test_stats.py::test_stats_includes_monthly_metrics -v
```
Expected: FAIL — keys missing.

- [ ] **Step 3: Extend `get_habit_stats`**

In `beaverhabits/routes/api.py`, replace the `return` dict in `get_habit_stats` (line ~360):

```python
    today = datetime.date.today()
    month_start = today.replace(day=1)
    days_elapsed = today.day  # days 1..today (inclusive)

    monthly_records = [r for r in habit.records if r.day >= month_start and r.day <= today]
    monthly_checkins = sum(1 for r in monthly_records if r.count >= target)
    monthly_completion = sum(r.count for r in monthly_records)
    monthly_checkin_rate = round(monthly_checkins / days_elapsed * 100, 1) if days_elapsed > 0 else 0.0

    total_completion = sum(r.count for r in habit.records)

    return {
        "streak": streak,
        "total": len(done_dates),
        "percent_7d": _scoped_percent(done_dates, today, 7, started),
        "percent_30d": _scoped_percent(done_dates, today, 30, started),
        "percent_90d": _scoped_percent(done_dates, today, 90, started),
        "target_count": target,
        "date_started": started.isoformat(),
        "monthly_checkins": monthly_checkins,
        "monthly_checkin_rate": monthly_checkin_rate,
        "monthly_completion": monthly_completion,
        "total_completion": total_completion,
    }
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/test_stats.py -v
```
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_stats.py
git commit -m "feat(api): add monthly_checkins, monthly_checkin_rate, monthly_completion, total_completion to /stats"
```

---

## Phase 2 — CSS full rewrite

### Task 2.1: Replace `styles.css` with new TickTick design system

**Files:**
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 1: Write the new stylesheet**

Replace the entire contents of `beaverhabits/static/css/styles.css` with:

```css
/* ── Design tokens ─────────────────────────────────────────── */
[data-theme="midnight"] {
    --bg-primary:   #0d0d11;
    --bg-surface:   #111118;
    --bg-elevated:  #16161e;
    --bg-input:     #1a1a24;
    --border:       #1e1e2a;
    --accent:       #2563eb;
    --accent-light: #60a5fa;
    --accent-sel:   #111c30;   /* selected-habit bg */
    --text-primary: #e0e0e0;
    --text-secondary:#666;
    --text-muted:   #444;
    --streak:       #f97316;
    --danger:       #ef4444;
    --success:      #22c55e;
    --modal-bg:     rgba(0,0,0,.72);
}
[data-theme="arctic"] {
    --bg-primary:   #f0f2f7;
    --bg-surface:   #ffffff;
    --bg-elevated:  #e8ebf2;
    --bg-input:     #f5f6fa;
    --border:       #d4d8e5;
    --accent:       #2563eb;
    --accent-light: #3b82f6;
    --accent-sel:   #dce8fd;
    --text-primary: #1a1a2e;
    --text-secondary:#888;
    --text-muted:   #aaa;
    --streak:       #ea580c;
    --danger:       #dc2626;
    --success:      #16a34a;
    --modal-bg:     rgba(0,0,0,.4);
}
:root {
    --r:    8px;
    --rl:   12px;
    --mono: 'JetBrains Mono', monospace;
    --sans: system-ui, -apple-system, 'Segoe UI', sans-serif;
    --nav-w:    46px;
    --list-w:   340px;
    --transition: .14s ease;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; overflow: hidden; }
body { font-family: var(--sans); background: var(--bg-primary); color: var(--text-primary); font-size: 13px; }
button, input, select, textarea { font-family: inherit; }
::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* ── App shell ─────────────────────────────────────────────── */
.app { display: flex; height: 100dvh; overflow: hidden; }

/* ── Nav rail ──────────────────────────────────────────────── */
.nav-rail {
    width: var(--nav-w); flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; align-items: center;
    padding: 8px 0; gap: 4px; z-index: 60;
}
.nav-avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff;
    cursor: default; margin-bottom: 4px;
}
.nav-item {
    width: 34px; height: 34px; border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; font-size: 17px; color: var(--text-muted);
    transition: background var(--transition), color var(--transition);
    border: none; background: none; text-decoration: none;
}
.nav-item:hover { background: var(--bg-elevated); color: var(--text-secondary); }
.nav-item.active { background: #1e2d4a; color: var(--accent-light); }
.nav-spacer { flex: 1; }

/* ── Panels ─────────────────────────────────────────────────  */
.panels { display: flex; flex: 1; overflow: hidden; }

/* ── List panel ─────────────────────────────────────────────  */
.list-panel {
    width: var(--list-w); flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column; overflow: hidden;
}

/* Top bar */
.list-topbar {
    height: 48px; padding: 0 12px;
    display: flex; align-items: center; gap: 8px;
    border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.list-topbar-title { font-size: 14px; font-weight: 600; flex: 1; }
.list-topbar-title svg { width: 10px; height: 10px; margin-left: 4px; opacity: .5; }
.ibtn {
    width: 28px; height: 28px; border-radius: 6px; border: none; background: none;
    color: var(--text-muted); cursor: pointer; font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: background var(--transition), color var(--transition);
}
.ibtn:hover { background: var(--bg-elevated); color: var(--text-primary); }
.ibtn.dng:hover { color: var(--danger); }

/* Week strip */
.week-strip {
    padding: 8px 12px 6px; border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.week-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.week-day {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 5px 2px; border-radius: 6px; cursor: pointer;
    transition: background var(--transition);
}
.week-day:hover { background: var(--bg-elevated); }
.week-day.today .wd-num { background: var(--accent); color: #fff; }
.week-day.active { background: var(--bg-elevated); }
.wd-label { font-size: 9px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
.wd-num { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; }
.wd-dot { width: 5px; height: 5px; border-radius: 50%; background: transparent; }
.wd-dot.partial { background: rgba(37,99,235,.4); }
.wd-dot.full { background: var(--accent); }
.active-day-chip {
    margin-top: 6px; display: flex; align-items: center; gap: 6px;
    font-size: 11px; color: var(--accent-light);
}
.active-day-chip button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; line-height: 1; }

/* Group headers */
.group-header {
    display: flex; align-items: center; gap: 6px;
    padding: 10px 14px 6px; cursor: pointer;
    font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
    color: var(--text-secondary);
    user-select: none;
}
.group-header .gh-arrow { font-size: 9px; transition: transform var(--transition); }
.group-header.collapsed .gh-arrow { transform: rotate(-90deg); }
.group-header .gh-count {
    margin-left: auto; background: var(--bg-elevated);
    padding: 1px 6px; border-radius: 10px; font-size: 10px;
}

/* Habit rows */
.habit-list { flex: 1; overflow-y: auto; padding-bottom: 12px; }
.hrow {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px;
    cursor: pointer; transition: background var(--transition);
    border-left: 3px solid transparent; position: relative;
}
.hrow:hover { background: var(--bg-elevated); }
.hrow.selected { background: var(--accent-sel) !important; border-left-color: var(--accent); }
.hrow-icon {
    width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 16px;
    background: var(--bg-elevated); border: 1px solid var(--border);
}
.hrow-body { flex: 1; min-width: 0; }
.hrow-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hrow-name.done { text-decoration: line-through; color: var(--text-muted); }
.hrow-meta { display: flex; gap: 8px; margin-top: 2px; font-size: 11px; color: var(--text-muted); }

/* Regular habit toggle */
.hrow-toggle {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    border: 2px solid var(--border); background: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all var(--transition);
}
.hrow-toggle:hover { border-color: var(--accent); }
.hrow-toggle.done { background: var(--accent); border-color: var(--accent); color: #fff; }
.hrow-toggle.done::after { content: '✓'; font-size: 13px; font-weight: 700; }

/* Progress ring (sub-goal habit icon) */
.progress-ring { width: 30px; height: 30px; flex-shrink: 0; }
.progress-ring circle { fill: none; stroke-width: 3; }
.progress-ring .track { stroke: var(--border); }
.progress-ring .fill { stroke: var(--accent); stroke-linecap: round; transition: stroke-dashoffset .3s; }

/* Sub-goal pills */
.subgoal-pills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.sg-pill {
    padding: 3px 8px; border-radius: 20px; font-size: 11px; cursor: pointer;
    border: 1px solid var(--border); background: var(--bg-elevated);
    color: var(--text-muted); transition: all var(--transition);
    user-select: none;
}
.sg-pill:hover { border-color: var(--accent-light); color: var(--accent-light); }
.sg-pill.done { background: #1a2d4a; border-color: var(--accent); color: var(--accent-light); }
.sg-pill.done::before { content: '✓ '; }

/* ── Detail panel ───────────────────────────────────────────  */
.detail-panel {
    flex: 1; background: var(--bg-primary);
    display: flex; flex-direction: column; overflow-y: auto;
}
.detail-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--text-muted); gap: 10px;
}
.detail-empty svg { width: 48px; height: 48px; opacity: .3; }

/* Detail header */
.detail-header {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 20px 12px; border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}
.detail-icon { width: 36px; height: 36px; font-size: 20px; display: flex; align-items: center; justify-content: center; }
.detail-title { font-size: 17px; font-weight: 600; flex: 1; }
.detail-more { color: var(--text-muted); font-size: 18px; }

/* Stat cards */
.stat-grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 8px; padding: 16px 20px 0;
}
.stat-card {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px 14px;
}
.stat-val { font-size: 22px; font-weight: 700; color: var(--accent-light); line-height: 1.1; }
.stat-val.streak { color: var(--streak); }
.stat-lbl {
    font-size: 10px; letter-spacing: .06em; text-transform: uppercase;
    color: var(--text-muted); margin-top: 3px;
}

/* Monthly calendar */
.cal-section { padding: 16px 20px 0; }
.cal-section-title { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 10px; }
.cal-nav-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.cal-month-label { font-size: 14px; font-weight: 600; flex: 1; }
.cal-nav-btn {
    width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--border);
    background: none; cursor: pointer; color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center; font-size: 14px;
    transition: background var(--transition);
}
.cal-nav-btn:hover { background: var(--bg-elevated); }
.cal-nav-btn:disabled { opacity: .3; cursor: not-allowed; }
.cal-dows {
    display: grid; grid-template-columns: repeat(7, 1fr);
    text-align: center; margin-bottom: 4px;
}
.cal-dows span { font-size: 9px; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); padding: 2px 0; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; }
.cal-circle {
    aspect-ratio: 1; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; font-size: 11px; cursor: pointer;
    background: var(--bg-input); color: var(--text-secondary);
    transition: all var(--transition); position: relative;
}
.cal-circle.out-of-month { opacity: .25; pointer-events: none; }
.cal-circle.today { outline: 2px solid var(--accent); outline-offset: 1px; }
.cal-circle.future { cursor: default; }
.cal-circle.done { background: var(--accent); color: #fff; }
.cal-circle.done::after { content: '✓'; font-size: 12px; font-weight: 700; position: absolute; }
.cal-circle.done span { display: none; }
.cal-circle.partial { background: none; }
.cal-circle:hover:not(.out-of-month):not(.future):not(.done) { background: var(--bg-elevated); }

/* Sub-goal popup picker */
.sg-popup {
    position: fixed; z-index: 200; min-width: 200px;
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 10px; box-shadow: 0 8px 32px rgba(0,0,0,.4);
    padding: 10px 0; overflow: hidden;
}
.sg-popup-title { padding: 6px 14px 10px; font-size: 11px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.sg-popup-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 14px; cursor: pointer; font-size: 13px;
    transition: background var(--transition);
}
.sg-popup-item:hover { background: var(--bg-elevated); }
.sg-popup-item .sg-check { width: 16px; height: 16px; border-radius: 4px; border: 2px solid var(--border); flex-shrink: 0; transition: all var(--transition); }
.sg-popup-item.checked .sg-check { background: var(--accent); border-color: var(--accent); }
.sg-popup-item.checked .sg-check::after { content: '✓'; color: #fff; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center; line-height: 1; margin-top: 1px; }

/* Bottom sheet (mobile popup) */
.sg-sheet {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
    background: var(--bg-surface); border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0;
    padding: 0 0 env(safe-area-inset-bottom,0);
    transform: translateY(100%); transition: transform .25s ease;
}
.sg-sheet.open { transform: translateY(0); }
.sg-sheet-handle { width: 36px; height: 4px; border-radius: 2px; background: var(--border); margin: 10px auto; }
.sg-sheet-title { padding: 6px 16px 12px; font-size: 13px; font-weight: 600; border-bottom: 1px solid var(--border); }

/* Daily goals line chart */
.chart-section { padding: 16px 20px 20px; }
.chart-wrap { position: relative; height: 100px; }
.chart-wrap svg { width: 100%; height: 100%; overflow: visible; }

/* ── Modals ─────────────────────────────────────────────────  */
.ov {
    position: fixed; inset: 0; z-index: 100;
    background: var(--modal-bg); display: none;
    align-items: center; justify-content: center; padding: 16px;
}
.ov.on { display: flex; }
.modal {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 14px; width: 100%; max-width: 460px;
    max-height: 90dvh; display: flex; flex-direction: column;
    overflow: hidden;
}
.mh { display: flex; align-items: center; padding: 16px 18px; border-bottom: 1px solid var(--border); }
.mt { flex: 1; font-size: 15px; font-weight: 600; }
.mx { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-muted); line-height: 1; padding: 2px 4px; }
.mx:hover { color: var(--text-primary); }
.mb { overflow-y: auto; padding: 18px; flex: 1; display: flex; flex-direction: column; gap: 14px; }
.mf { padding: 14px 18px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.fg { display: flex; flex-direction: column; gap: 5px; }
.fl { font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--text-muted); }
.finp {
    background: var(--bg-input); border: 1px solid var(--border);
    border-radius: var(--r); color: var(--text-primary);
    padding: 9px 11px; font-size: 13px; outline: none;
    transition: border-color var(--transition);
}
.finp:focus { border-color: var(--accent); }
.finp::placeholder { color: var(--text-muted); }
textarea.finp { resize: vertical; min-height: 80px; }
.cwarn { font-size: 11px; color: var(--text-muted); }

/* Sub-goals list inside modal */
.sg-list { display: flex; flex-direction: column; gap: 4px; }
.sg-list-item {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 7px; padding: 6px 8px;
}
.sg-drag-handle { cursor: grab; color: var(--text-muted); font-size: 13px; }
.sg-list-item input { flex: 1; background: none; border: none; color: var(--text-primary); font-size: 13px; outline: none; }
.sg-list-item button { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 16px; line-height: 1; }
.sg-list-item button:hover { color: var(--danger); }
.sg-add-btn {
    background: none; border: 1px dashed var(--border); border-radius: 7px;
    color: var(--text-muted); padding: 7px; cursor: pointer; font-size: 12px;
    text-align: center; width: 100%; transition: all var(--transition);
}
.sg-add-btn:hover { border-color: var(--accent); color: var(--accent); }
.sg-preview { font-size: 11px; color: var(--text-muted); padding: 4px 0; }

/* Buttons */
.bpri { background: var(--accent); color: #fff; border: none; border-radius: var(--r); padding: 9px 18px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity var(--transition); }
.bpri:hover { opacity: .88; }
.bgho { background: none; border: 1px solid var(--border); color: var(--text-primary); border-radius: var(--r); padding: 9px 18px; font-size: 13px; cursor: pointer; transition: background var(--transition); }
.bgho:hover { background: var(--bg-elevated); }
.bdng { background: none; border: 1px solid var(--border); color: var(--danger); border-radius: var(--r); padding: 9px 18px; font-size: 13px; cursor: pointer; }
.bdng:hover { background: rgba(239,68,68,.08); border-color: var(--danger); }

/* Settings drawer */
.settings-drawer {
    position: fixed; inset: 0; z-index: 110; pointer-events: none;
}
.settings-drawer.open { pointer-events: all; }
.settings-shade { position: absolute; inset: 0; background: var(--modal-bg); opacity: 0; transition: opacity .25s; }
.settings-drawer.open .settings-shade { opacity: 1; }
.settings-panel {
    position: absolute; right: 0; top: 0; bottom: 0; width: min(400px, 100vw);
    background: var(--bg-surface); border-left: 1px solid var(--border);
    display: flex; flex-direction: column;
    transform: translateX(100%); transition: transform .25s ease;
    overflow: hidden;
}
.settings-drawer.open .settings-panel { transform: translateX(0); }
.settings-header { padding: 16px 18px; border-bottom: 1px solid var(--border); display: flex; align-items: center; }
.settings-header .mt { font-size: 15px; font-weight: 600; flex: 1; }
.settings-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 20px; }
.ss-section { display: flex; flex-direction: column; gap: 10px; }
.ss-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--text-muted); }
.srow { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.slabel { font-size: 13px; }

/* ── Auth screen ───────────────────────────────────────────── */
.auth-screen { display: flex; align-items: center; justify-content: center; min-height: 100dvh; padding: 20px; background: var(--bg-primary); }
.auth-box { width: 100%; max-width: 340px; text-align: center; }
.auth-logo-mark { font-size: 40px; margin-bottom: 12px; }
.auth-wordmark { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.auth-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 28px; }
.auth-field { margin-bottom: 10px; }
.auth-field input { width: 100%; padding: 13px 14px; background: var(--bg-input); border: 1.5px solid var(--border); border-radius: var(--r); color: var(--text-primary); font-size: 14px; outline: none; transition: border-color var(--transition); }
.auth-field input:focus { border-color: var(--accent); }
.auth-field input::placeholder { color: var(--text-muted); }
.auth-btn { width: 100%; padding: 13px; margin-top: 6px; background: var(--accent); color: #fff; border: none; border-radius: var(--r); font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity var(--transition); }
.auth-btn:hover { opacity: .88; }
.auth-error { color: var(--danger); font-size: 13px; margin-top: 12px; min-height: 20px; }

/* ── Toast ──────────────────────────────────────────────────  */
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px); background: #1e1e2e; color: var(--text-primary); padding: 10px 18px; border-radius: 8px; font-size: 13px; opacity: 0; pointer-events: none; transition: opacity .2s, transform .2s; z-index: 300; white-space: nowrap; border: 1px solid var(--border); }
.toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.toast.err { background: #2a1212; border-color: var(--danger); }

/* ── Heatmap (multi-year page) ──────────────────────────────  */
.heatmap-page { padding: 20px; flex: 1; overflow-y: auto; }
.heatmap-year-title { font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--text-secondary); }
.hm-grid { display: grid; grid-template-columns: repeat(53, 1fr); gap: 2px; margin-bottom: 20px; }
.hm-cell { aspect-ratio: 1; border-radius: 2px; background: var(--bg-input); }
.hm-cell.l1 { background: #1e3a8a; }
.hm-cell.l2 { background: #1d4ed8; }
.hm-cell.l3 { background: #2563eb; }
.hm-cell.l4 { background: #60a5fa; }
@media (max-width: 640px) { .hm-grid { grid-template-columns: repeat(26, 1fr); } }

/* ── Mobile ─────────────────────────────────────────────────  */
@media (max-width: 767px) {
    :root { --list-w: 100vw; --nav-w: 0px; }
    .nav-rail { display: none; }
    .list-panel { width: 100%; }
    .detail-panel { position: fixed; inset: 0; z-index: 80; transform: translateX(100%); transition: transform .25s ease; }
    .detail-panel.open { transform: translateX(0); }
    .detail-back { display: flex !important; }
}
.detail-back {
    display: none; align-items: center; gap: 8px; padding: 12px 16px;
    font-size: 13px; color: var(--accent-light); cursor: pointer;
    border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 2: Verify file is valid**

```bash
python3 -c "
import re, sys
css = open('beaverhabits/static/css/styles.css').read()
opens = css.count('{')
closes = css.count('}')
if opens != closes:
    print(f'WARN: unmatched braces: {opens} {{ vs {closes} }}')
    sys.exit(1)
print('CSS brace check OK')
"
```
Expected: `CSS brace check OK`.

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/static/css/styles.css
git commit -m "feat(css): full TickTick design system — nav rail, split panel, circles, pills, drawer"
```

---

## Phase 3 — Templates

### Task 3.1: Rewrite `base.html` — nav rail + split panel shell

**Files:**
- Modify: `beaverhabits/templates/base.html`

- [ ] **Step 1: Replace the file**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>{% block title %}HabitLab{% endblock %}</title>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="manifest" href="/static/manifest.json">
<meta name="theme-color" content="#0d0d11">
<link rel="stylesheet" href="/static/css/styles.css?v={{ asset_version }}">
<script>
    (function(){
        var t=localStorage.getItem('theme')||'midnight';
        document.documentElement.setAttribute('data-theme',t);
    })();
</script>
</head>
<body data-theme="midnight">

<div class="app">
    <!-- Nav rail -->
    <nav class="nav-rail" id="navRail">
        <div class="nav-avatar" id="navAvatar">H</div>
        <a href="/" class="nav-item {% block nav_habits %}{% endblock %}" title="Habits">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </a>
        <a href="/stats" class="nav-item {% block nav_stats %}{% endblock %}" title="Stats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </a>
        <button class="nav-item" id="searchBtn" title="Search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <div class="nav-spacer"></div>
        <button class="nav-item" id="settingsBtn" title="Settings" onclick="openSettings()">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>
    </nav>

    <!-- Main panels area -->
    <div class="panels">
        {% block panels %}{% endblock %}
    </div>
</div>

{% include "_settings_modal.html" %}
{% include "_note_modal.html" %}
{% include "_habit_modal.html" %}

<div class="toast" id="toast"></div>

<script type="module" src="/static/js/api.js?v={{ asset_version }}"></script>
<script type="module" src="/static/js/app.js?v={{ asset_version }}"></script>
{% block scripts %}{% endblock %}
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/templates/base.html
git commit -m "feat(templates): rewrite base.html — nav rail + split panel shell"
```

---

### Task 3.2: Rewrite `index.html` — list panel + detail panel containers

**Files:**
- Modify: `beaverhabits/templates/index.html`

- [ ] **Step 1: Replace the file**

```html
{% extends "base.html" %}
{% block title %}Habits · HabitLab{% endblock %}
{% block nav_habits %}active{% endblock %}

{% block panels %}
<!-- ── List panel ── -->
<div class="list-panel" id="listPanel">

    <!-- Top bar -->
    <div class="list-topbar">
        <span class="list-topbar-title">
            Habit
            <svg viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 1l4 4 4-4"/></svg>
        </span>
        <button class="ibtn" id="layoutToggle" title="Layout">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        </button>
        <button class="ibtn bpri" id="addBtn" title="Add habit" style="background:var(--accent);color:#fff;border:none;width:auto;padding:0 10px;font-size:13px;gap:4px">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="ibtn" id="moreBtn" title="More">···</button>
    </div>

    <!-- Week strip -->
    <div class="week-strip" id="weekStrip">
        <div class="week-days" id="weekDays"></div>
        <div class="active-day-chip" id="activeDayChip" style="display:none">
            <span id="activeDayLabel"></span>
            <button id="activeDayClear" title="Back to today">✕</button>
        </div>
    </div>

    <!-- Habit list -->
    <div class="habit-list" id="habitList"></div>
</div>

<!-- ── Detail panel ── -->
<div class="detail-panel" id="detailPanel">
    <!-- Back button (mobile only) -->
    <div class="detail-back" id="detailBack" onclick="closeDetail()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        Back
    </div>

    <!-- Empty state -->
    <div class="detail-empty" id="detailEmpty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        <p>Select a habit to see details</p>
    </div>

    <!-- Populated detail (hidden until habit selected) -->
    <div id="detailContent" style="display:none; flex-direction:column; flex:1;">
        <!-- Header -->
        <div class="detail-header">
            <div class="detail-icon" id="detailIcon">📌</div>
            <div class="detail-title" id="detailTitle">—</div>
            <button class="ibtn detail-more" id="detailMore" title="Edit / Archive / Delete">···</button>
        </div>

        <!-- 6 stat cards -->
        <div class="stat-grid" id="statGrid">
            <div class="stat-card"><div class="stat-val" id="statMonthlyCheckins">—</div><div class="stat-lbl">Monthly check-ins</div></div>
            <div class="stat-card"><div class="stat-val" id="statTotalCheckins">—</div><div class="stat-lbl">Total check-ins</div></div>
            <div class="stat-card"><div class="stat-val" id="statMonthlyRate">—</div><div class="stat-lbl">Monthly check-in rate</div></div>
            <div class="stat-card"><div class="stat-val streak" id="statStreak">—</div><div class="stat-lbl">Current streak</div></div>
            <div class="stat-card"><div class="stat-val" id="statMonthlyCompletion">—</div><div class="stat-lbl">Monthly completion</div></div>
            <div class="stat-card"><div class="stat-val" id="statTotalCompletion">—</div><div class="stat-lbl">Total completion</div></div>
        </div>

        <!-- Monthly calendar -->
        <div class="cal-section">
            <div class="cal-section-title">Monthly view</div>
            <div id="calContainer"></div>
        </div>

        <!-- Daily goals chart -->
        <div class="chart-section">
            <div class="cal-section-title">Daily goals</div>
            <div class="chart-wrap" id="chartWrap"></div>
        </div>
    </div>
</div>

<!-- Sub-goal popup (anchored) -->
<div id="sgPopup" class="sg-popup" style="display:none"></div>
<!-- Sub-goal bottom sheet (mobile) -->
<div id="sgSheet" class="sg-sheet">
    <div class="sg-sheet-handle"></div>
    <div class="sg-sheet-title" id="sgSheetTitle"></div>
    <div id="sgSheetItems"></div>
</div>
<div id="sgSheetShade" style="display:none;position:fixed;inset:0;z-index:199" onclick="closeSgSheet()"></div>
{% endblock %}

{% block scripts %}
<script src="/static/vendor/sortable.min.js"></script>
<script type="module" src="/static/js/monthly.js?v={{ asset_version }}"></script>
<script type="module" src="/static/js/habits.js?v={{ asset_version }}"></script>
<script type="module" src="/static/js/notes.js?v={{ asset_version }}"></script>
{% endblock %}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/templates/index.html
git commit -m "feat(templates): rewrite index.html — list panel + detail panel split layout"
```

---

### Task 3.3: Rewrite `_habit_modal.html` — sub-goal fields + unit label

**Files:**
- Modify: `beaverhabits/templates/_habit_modal.html`

- [ ] **Step 1: Replace the file**

```html
<div class="ov" id="habitOv">
    <div class="modal">
        <div class="mh">
            <div class="mt" id="habitModalTitle">New Habit</div>
            <button class="mx" onclick="closeHabitModal()">&times;</button>
        </div>
        <div class="mb">

            <!-- Icon + Name row -->
            <div class="fg" style="flex-direction:row;align-items:center;gap:10px">
                <button class="hrow-icon" id="habitIconBtn" style="flex-shrink:0;width:44px;height:44px;font-size:22px;cursor:pointer;border:1px solid var(--border);background:var(--bg-elevated);border-radius:10px" onclick="openIconPicker()">📌</button>
                <div class="fg" style="flex:1">
                    <label class="fl">Name</label>
                    <input class="finp" id="habitNameIn" maxlength="80" placeholder="e.g. Salah">
                </div>
            </div>

            <!-- Tag -->
            <div class="fg">
                <label class="fl">Tag (group)</label>
                <input class="finp" id="habitTagIn" placeholder="Morning, Evening, Health…">
            </div>

            <!-- Sub-goals toggle -->
            <div class="fg">
                <div class="srow">
                    <div>
                        <div class="slabel" style="font-size:13px">Has sub-goals</div>
                        <div class="cwarn">Named checkpoints within one habit (e.g. prayers)</div>
                    </div>
                    <label style="cursor:pointer;display:flex;align-items:center;gap:6px">
                        <input type="checkbox" id="habitSubgoalToggle" style="width:16px;height:16px;accent-color:var(--accent)" onchange="toggleSubgoalSection()">
                    </label>
                </div>
            </div>

            <!-- Sub-goal section (shown when toggle ON) -->
            <div id="subgoalSection" style="display:none;flex-direction:column;gap:10px">
                <div class="fg">
                    <label class="fl">Sub-goals</label>
                    <div class="sg-list" id="sgModalList"></div>
                    <button class="sg-add-btn" onclick="addSubgoalRow()" type="button">＋ Add sub-goal</button>
                </div>
                <div class="fg">
                    <label class="fl">Unit label</label>
                    <input class="finp" id="habitUnitIn" placeholder="prayers" style="width:160px">
                    <div class="sg-preview" id="sgPreview">Preview: 0 / 0 items</div>
                </div>
            </div>

        </div>
        <div class="mf">
            <button class="bdng" id="habitDeleteBtn" style="visibility:hidden" onclick="deleteCurrentHabit()">Delete</button>
            <div style="display:flex;gap:8px">
                <button class="bgho" onclick="closeHabitModal()">Cancel</button>
                <button class="bpri" id="habitSaveBtn" onclick="saveHabit()">Save</button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/templates/_habit_modal.html
git commit -m "feat(templates): rewrite _habit_modal.html with sub-goal toggle, list, and unit label"
```

---

### Task 3.4: Restyle `login.html`, `_settings_modal.html`, `_note_modal.html`

**Files:**
- Modify: `beaverhabits/templates/login.html`
- Modify: `beaverhabits/templates/_settings_modal.html`
- Modify: `beaverhabits/templates/_note_modal.html`

- [ ] **Step 1: Update `login.html` to use new token names**

Find and replace in `beaverhabits/templates/login.html`:
- `var(--accent-glow2)` → `rgba(37,99,235,.15)`
- `var(--accent-glow)` → `rgba(37,99,235,.08)`
- `var(--mono)` → `system-ui, -apple-system, sans-serif`
- `class="auth-hex"` → `class="auth-logo-mark"`
- `class="auth-logo"` → `class="auth-wordmark"`

(The rest of the HTML structure is already compatible with the new CSS.)

- [ ] **Step 2: Replace `_settings_modal.html` with drawer version**

Replace the entire `_settings_modal.html`:

```html
<div class="settings-drawer" id="settingsDrawer">
    <div class="settings-shade" onclick="closeSettings()"></div>
    <div class="settings-panel">
        <div class="settings-header">
            <div class="mt">Settings</div>
            <button class="mx" onclick="closeSettings()">&times;</button>
        </div>
        <div class="settings-body">

            <div class="ss-section">
                <div class="ss-title">Appearance</div>
                <div class="srow">
                    <div class="slabel">Theme</div>
                    <select class="finp" id="setThemeSel" style="width:auto">
                        <option value="midnight">Midnight (dark)</option>
                        <option value="arctic">Arctic (light)</option>
                    </select>
                </div>
            </div>

            <div class="ss-section">
                <div class="ss-title">Master password</div>
                <div class="fg"><label class="fl">Current</label><input class="finp" type="password" id="cpCurrent"></div>
                <div class="fg"><label class="fl">New (8+ chars)</label><input class="finp" type="password" id="cpNew" minlength="8"></div>
                <button class="bpri" id="cpSubmit" style="align-self:flex-start">Change password</button>
            </div>

            <div class="ss-section">
                <div class="ss-title">Data</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <button class="bpri" id="exportBtn">Export JSON</button>
                    <button class="bgho" id="importBtn">Import JSON</button>
                    <input type="file" id="importFile" accept="application/json" style="display:none">
                </div>
            </div>

            <div class="ss-section">
                <div class="ss-title">API token</div>
                <div id="tokenView">Loading…</div>
            </div>

        </div>
    </div>
</div>
```

- [ ] **Step 3: Update `_note_modal.html`**

In `_note_modal.html`, update selectors to match new CSS class names. The current file already uses `.ov`, `.modal`, `.mh`, `.mt`, `.mx`, `.mb`, `.mf`, `.fg`, `.fl`, `.finp`, `.fta`, `.bpri`, `.bgho`, `.bdng` — these all still exist in the new CSS. No structural changes needed. However, add `style="display:flex"` to `.mf`:

```html
<!-- change <div class="mf"> to: -->
<div class="mf" style="display:flex">
```

(Only change needed — everything else is compatible.)

- [ ] **Step 4: Commit**

```bash
git add beaverhabits/templates/login.html beaverhabits/templates/_settings_modal.html beaverhabits/templates/_note_modal.html
git commit -m "feat(templates): restyle login, settings drawer, note modal for new design system"
```

---

## Phase 4 — `monthly.js`: circle calendar + popup picker + line chart

### Task 4.1: Create `monthly.js` — circle calendar grid, toggle, sub-goal popup

**Files:**
- Create: `beaverhabits/static/js/monthly.js`

- [ ] **Step 1: Write the file**

```javascript
// beaverhabits/static/js/monthly.js
import { api, toast } from '/static/js/api.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Module state ─────────────────────────────────────────────
let calState = null;
// calState = { habitId, subGoals, target, year, month, recordsByDay }
// recordsByDay: Map<'YYYY-MM-DD', { count, done, sub_goals_done }>

// ── Public API ───────────────────────────────────────────────

/**
 * Mount the monthly calendar into #calContainer.
 * Called by habits.js when a habit is selected.
 * @param {string} habitId
 * @param {Array}  subGoals  [{id, name}, ...]
 * @param {number} target
 * @param {Array}  records   [{day, count, done, sub_goals_done}, ...]
 */
export function mountCalendar(habitId, subGoals, target, records) {
    const today = new Date();
    const map = new Map();
    for (const r of records) {
        map.set(r.day, { count: r.count, done: r.done, sub_goals_done: r.sub_goals_done || [] });
    }
    calState = {
        habitId, subGoals, target,
        year: today.getFullYear(), month: today.getMonth(),
        recordsByDay: map,
    };

    const host = document.getElementById('calContainer');
    if (!host) return;
    host.innerHTML = `
        <div class="cal-nav-row">
            <button class="cal-nav-btn" id="calPrev">‹</button>
            <div class="cal-month-label" id="calMonthLabel"></div>
            <button class="cal-nav-btn" id="calNext">›</button>
        </div>
        <div class="cal-dows">${DOWS.map(d=>`<span>${d}</span>`).join('')}</div>
        <div class="cal-grid" id="calGrid"></div>`;

    host.querySelector('#calPrev').addEventListener('click', () => shiftMonth(-1, host));
    host.querySelector('#calNext').addEventListener('click', () => shiftMonth(1, host));
    renderCalGrid(host);
}

function shiftMonth(delta, host) {
    calState.month += delta;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalGrid(host);
}

function renderCalGrid(host) {
    if (!calState) return;
    const { year, month, recordsByDay, subGoals, target } = calState;
    const label = host.querySelector('#calMonthLabel');
    if (label) label.textContent = `${MONTHS[month]} ${year}`;

    const nextBtn = host.querySelector('#calNext');
    const today = new Date(); today.setHours(0,0,0,0);
    const nextMonthStart = new Date(year, month + 1, 1);
    if (nextBtn) nextBtn.disabled = nextMonthStart > today;

    const grid = host.querySelector('#calGrid');
    grid.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = firstOfMonth.getDay(); // 0=Sun

    // Pad with out-of-month cells (previous month)
    for (let i = 0; i < startDow; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-circle out-of-month';
        const prevDate = new Date(year, month, -(startDow - i - 1));
        cell.textContent = prevDate.getDate();
        grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const iso = cellDate.toISOString().slice(0, 10);
        const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [] };
        const isFuture = cellDate > today;
        const isToday = cellDate.getTime() === today.getTime();

        const cell = document.createElement('div');
        cell.className = 'cal-circle';
        if (isFuture) cell.classList.add('future');
        if (isToday) cell.classList.add('today');
        cell.dataset.date = iso;

        paintCalCircle(cell, rec, subGoals, target);

        if (!isFuture) {
            cell.addEventListener('click', () => onCalCircleClick(cell, iso));
        }
        grid.appendChild(cell);
    }
}

function paintCalCircle(cell, rec, subGoals, target) {
    cell.classList.remove('done', 'partial');
    cell.innerHTML = '';

    const dayNum = new Date(cell.dataset.date + 'T00:00:00').getDate();

    if (rec.done || rec.count >= target) {
        cell.classList.add('done');
        // done::after shows ✓ via CSS; hide day number
    } else if (subGoals.length > 0 && rec.sub_goals_done.length > 0) {
        // Partial — draw conic ring
        cell.classList.add('partial');
        const pct = rec.sub_goals_done.length / subGoals.length;
        const deg = Math.round(pct * 360);
        cell.style.background = `conic-gradient(var(--accent) 0deg ${deg}deg, var(--bg-input) ${deg}deg 360deg)`;
        const inner = document.createElement('div');
        inner.style.cssText = `width:calc(100% - 6px);height:calc(100% - 6px);border-radius:50%;background:var(--bg-primary);display:flex;align-items:center;justify-content:center;font-size:11px;`;
        inner.textContent = rec.sub_goals_done.length;
        cell.appendChild(inner);
    } else {
        cell.style.background = '';
        const span = document.createElement('span');
        span.textContent = dayNum;
        cell.appendChild(span);
    }
}

async function onCalCircleClick(cell, iso) {
    if (!calState) return;
    const { habitId, subGoals, target, recordsByDay } = calState;

    if (subGoals.length > 0) {
        openSubgoalPicker(cell, iso);
        return;
    }

    // Regular habit — step count
    const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [] };
    const newCount = rec.count >= target ? 0 : rec.count + 1;
    const prevRec = { ...rec };

    const newRec = { count: newCount, done: newCount >= target, sub_goals_done: [] };
    recordsByDay.set(iso, newRec);
    paintCalCircle(cell, newRec, [], target);

    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: newCount, date: iso, date_fmt: '%Y-%m-%d',
        });
    } catch (err) {
        recordsByDay.set(iso, prevRec);
        paintCalCircle(cell, prevRec, [], target);
        toast(err.message, 'error');
    }
}

// ── Sub-goal popup picker ─────────────────────────────────────

let popupOpenCell = null;

function openSubgoalPicker(cell, iso) {
    const { habitId, subGoals, recordsByDay } = calState;
    const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [] };
    const donSet = new Set(rec.sub_goals_done);
    const isMobile = window.innerWidth < 768;
    const dateLabel = new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    if (isMobile) {
        openSgSheet(iso, dateLabel, subGoals, donSet, habitId, rec, recordsByDay, cell);
        return;
    }

    popupOpenCell = cell;
    const popup = document.getElementById('sgPopup');
    popup.innerHTML = `<div class="sg-popup-title">${dateLabel}</div>`;

    subGoals.forEach(sg => {
        const item = document.createElement('div');
        item.className = 'sg-popup-item' + (donSet.has(sg.id) ? ' checked' : '');
        item.innerHTML = `<div class="sg-check"></div><span>${sg.name}</span>`;
        item.addEventListener('click', async () => {
            item.classList.toggle('checked');
            await toggleSubgoal(habitId, iso, sg.id, rec, recordsByDay, cell);
        });
        popup.appendChild(item);
    });

    // Position near cell
    const rect = cell.getBoundingClientRect();
    popup.style.display = 'block';
    const pw = popup.offsetWidth || 200;
    let left = rect.right + 6;
    if (left + pw > window.innerWidth - 8) left = rect.left - pw - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.min(rect.top, window.innerHeight - 200)}px`;

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closePopupOnOutside, { once: true, capture: true });
    }, 0);
}

function closePopupOnOutside(e) {
    const popup = document.getElementById('sgPopup');
    if (!popup.contains(e.target) && e.target !== popupOpenCell) {
        popup.style.display = 'none';
    }
}

function openSgSheet(iso, dateLabel, subGoals, donSet, habitId, rec, recordsByDay, cell) {
    document.getElementById('sgSheetTitle').textContent = dateLabel;
    const container = document.getElementById('sgSheetItems');
    container.innerHTML = '';
    subGoals.forEach(sg => {
        const item = document.createElement('div');
        item.className = 'sg-popup-item' + (donSet.has(sg.id) ? ' checked' : '');
        item.style.cssText = 'padding:13px 16px';
        item.innerHTML = `<div class="sg-check"></div><span>${sg.name}</span>`;
        item.addEventListener('click', async () => {
            item.classList.toggle('checked');
            await toggleSubgoal(habitId, iso, sg.id, rec, recordsByDay, cell);
        });
        container.appendChild(item);
    });
    document.getElementById('sgSheet').classList.add('open');
    document.getElementById('sgSheetShade').style.display = 'block';
}

window.closeSgSheet = function() {
    document.getElementById('sgSheet').classList.remove('open');
    document.getElementById('sgSheetShade').style.display = 'none';
};

async function toggleSubgoal(habitId, iso, sgId, rec, recordsByDay, cell) {
    try {
        const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
            date: iso, date_fmt: '%Y-%m-%d', sub_goal_id: sgId,
        });
        const newRec = {
            count: result.count,
            done: result.done,
            sub_goals_done: result.sub_goals_done,
        };
        recordsByDay.set(iso, newRec);
        paintCalCircle(cell, newRec, calState.subGoals, calState.target);
    } catch (err) { toast(err.message, 'error'); }
}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/monthly.js
git commit -m "feat(js): add monthly.js — circle calendar, toggle, sub-goal popup picker"
```

---

### Task 4.2: Add daily goals line chart to `monthly.js`

**Files:**
- Modify: `beaverhabits/static/js/monthly.js`

- [ ] **Step 1: Add `renderDailyChart` export at the bottom of the file**

```javascript
/**
 * Render a daily-goals line chart into #chartWrap.
 * @param {number} target  target_count for the habit
 * @param {Array}  records [{day, count}, ...]
 */
export function renderDailyChart(target, records) {
    const wrap = document.getElementById('chartWrap');
    if (!wrap) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build count array [day1, day2, ..., dayN]
    const counts = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = new Date(year, month, d).toISOString().slice(0, 10);
        const rec = records.find(r => r.day === iso);
        counts.push(rec ? rec.count : 0);
    }

    const W = 300; const H = 80; const PAD = 4;
    const maxY = Math.max(target, ...counts, 1);
    const xStep = (W - PAD * 2) / (daysInMonth - 1 || 1);

    const pts = counts.map((c, i) => {
        const x = PAD + i * xStep;
        const y = H - PAD - ((c / maxY) * (H - PAD * 2));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Target line y
    const ty = (H - PAD - ((target / maxY) * (H - PAD * 2))).toFixed(1);

    // Filled area (polygon adds bottom corners)
    const firstPt = `${PAD},${H - PAD}`;
    const lastPt = `${(PAD + (daysInMonth - 1) * xStep).toFixed(1)},${H - PAD}`;
    const fillPts = `${firstPt} ${pts} ${lastPt}`;

    wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity=".3"/>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <!-- Fill -->
        <polygon points="${fillPts}" fill="url(#chartFill)"/>
        <!-- Target line -->
        <line x1="${PAD}" y1="${ty}" x2="${W - PAD}" y2="${ty}"
              stroke="var(--accent-light)" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>
        <!-- Data line -->
        <polyline points="${pts}"
                  fill="none" stroke="var(--accent)" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/monthly.js
git commit -m "feat(js): add renderDailyChart SVG line chart to monthly.js"
```

---

## Phase 5 — `habits.js` full rewrite

### Task 5.1: Week strip + tag-grouped list + regular rows + sub-goal rows

**Files:**
- Modify: `beaverhabits/static/js/habits.js`

- [ ] **Step 1: Replace the entire file**

```javascript
// beaverhabits/static/js/habits.js
import { api, toast } from '/static/js/api.js';
import { mountCalendar, renderDailyChart } from '/static/js/monthly.js';
import { openNoteEditor } from '/static/js/notes.js';

// ── State ─────────────────────────────────────────────────────
let allHabits = [];
let activeDay = null;       // ISO string 'YYYY-MM-DD' — null = today
let selectedHabitId = null;
let searchTerm = '';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Utils ─────────────────────────────────────────────────────
function isoToday() {
    const d = new Date(); d.setHours(0,0,0,0);
    return d.toISOString().slice(0, 10);
}
function isoNDaysAgo(n) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function recordForDay(records, iso) {
    return records?.find(r => r.day === iso) || null;
}
function getActiveIso() { return activeDay || isoToday(); }

// ── Week strip ────────────────────────────────────────────────
function renderWeekStrip() {
    const container = document.getElementById('weekDays');
    if (!container) return;
    container.innerHTML = '';
    const todayIso = isoToday();
    const activeIso = getActiveIso();

    for (let i = 6; i >= 0; i--) {
        const iso = isoNDaysAgo(i);
        const d = new Date(iso + 'T00:00:00');
        const col = document.createElement('div');
        col.className = 'week-day' + (iso === todayIso ? ' today' : '') + (iso === activeIso ? ' active' : '');
        col.dataset.iso = iso;

        const label = document.createElement('div');
        label.className = 'wd-label';
        label.textContent = DAY_NAMES[d.getDay()];

        const num = document.createElement('div');
        num.className = 'wd-num';
        num.textContent = d.getDate();

        const dot = document.createElement('div');
        dot.className = 'wd-dot';
        // Dot: count habits done on this day
        const done = allHabits.filter(h => {
            const rec = recordForDay(h.records, iso);
            return rec && (rec.done || rec.count >= h.target_count);
        }).length;
        if (done > 0 && done < allHabits.length) dot.classList.add('partial');
        else if (done === allHabits.length && allHabits.length > 0) dot.classList.add('full');

        col.append(label, num, dot);
        col.addEventListener('click', () => {
            activeDay = iso === todayIso ? null : iso;
            renderWeekStrip();
            renderHabitList();
            updateActiveDayChip();
        });
        container.appendChild(col);
    }
}

function updateActiveDayChip() {
    const chip = document.getElementById('activeDayChip');
    const label = document.getElementById('activeDayLabel');
    if (!chip || !label) return;
    if (activeDay) {
        const d = new Date(activeDay + 'T00:00:00');
        label.textContent = `📌 ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        chip.style.display = 'flex';
    } else {
        chip.style.display = 'none';
    }
}

// ── Habit list rendering ──────────────────────────────────────
function groupByFirstTag(habits) {
    const groups = new Map(); // tag → [habit]
    for (const h of habits) {
        const tag = h.tags?.[0] || 'Others';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(h);
    }
    // "Others" always last
    const sorted = [...groups.entries()].sort(([a], [b]) => {
        if (a === 'Others') return 1;
        if (b === 'Others') return -1;
        return a.localeCompare(b);
    });
    return sorted;
}

function renderHabitList() {
    const container = document.getElementById('habitList');
    if (!container) return;
    container.innerHTML = '';
    const activeIso = getActiveIso();

    const filtered = searchTerm
        ? allHabits.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : allHabits;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:13px">No habits yet. Click + to add one.</div>';
        return;
    }

    const groups = groupByFirstTag(filtered);
    const collapsedGroups = new Set(JSON.parse(sessionStorage.getItem('collapsedGroups') || '[]'));

    for (const [tag, habits] of groups) {
        // Group header
        const header = document.createElement('div');
        header.className = 'group-header' + (collapsedGroups.has(tag) ? ' collapsed' : '');
        header.innerHTML = `<span class="gh-arrow">▼</span><span>${tag}</span><span class="gh-count">${habits.length}</span>`;
        header.addEventListener('click', () => {
            if (collapsedGroups.has(tag)) collapsedGroups.delete(tag);
            else collapsedGroups.add(tag);
            sessionStorage.setItem('collapsedGroups', JSON.stringify([...collapsedGroups]));
            renderHabitList();
        });
        container.appendChild(header);

        if (collapsedGroups.has(tag)) continue;

        for (const h of habits) {
            const row = h.sub_goals?.length > 0
                ? buildSubgoalRow(h, activeIso)
                : buildRegularRow(h, activeIso);
            container.appendChild(row);
        }
    }
}

// ── Regular habit row ─────────────────────────────────────────
function buildRegularRow(h, activeIso) {
    const rec = recordForDay(h.records, activeIso);
    const isDone = rec && (rec.done || rec.count >= h.target_count);

    const row = document.createElement('div');
    row.className = 'hrow' + (h.id === selectedHabitId ? ' selected' : '');
    row.dataset.habitId = h.id;

    const icon = document.createElement('div');
    icon.className = 'hrow-icon';
    icon.textContent = h.icon || '📌';

    const body = document.createElement('div');
    body.className = 'hrow-body';

    const name = document.createElement('div');
    name.className = 'hrow-name' + (isDone ? ' done' : '');
    name.textContent = h.name;

    const meta = document.createElement('div');
    meta.className = 'hrow-meta';
    // Streak badge
    const streakText = `🔥 ${h._streak ?? '—'}`;
    const daysText = `💧 ${h._total ?? '—'} days`;
    meta.innerHTML = `<span>${daysText}</span><span>${streakText}</span>`;

    body.append(name, meta);

    const toggle = document.createElement('button');
    toggle.className = 'hrow-toggle' + (isDone ? ' done' : '');
    toggle.title = isDone ? 'Mark undone' : 'Mark done';
    toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newCount = isDone ? 0 : h.target_count;
        const prevClass = toggle.className;
        toggle.className = 'hrow-toggle' + (newCount >= h.target_count ? ' done' : '');
        try {
            await api.post(`/api/v1/habits/${h.id}/completions`, {
                count: newCount, date: activeIso, date_fmt: '%Y-%m-%d',
            });
            await refreshHabits();
        } catch (err) {
            toggle.className = prevClass;
            toast(err.message, 'error');
        }
    });

    row.append(icon, body, toggle);
    row.addEventListener('click', () => selectHabit(h.id));
    return row;
}

// ── Sub-goal habit row ────────────────────────────────────────
function buildSubgoalRow(h, activeIso) {
    const rec = recordForDay(h.records, activeIso);
    const doneDoneIds = new Set(rec?.sub_goals_done || []);
    const total = h.sub_goals.length;
    const doneCount = doneDoneIds.size;
    const pct = total > 0 ? doneCount / total : 0;

    const row = document.createElement('div');
    row.className = 'hrow' + (h.id === selectedHabitId ? ' selected' : '');
    row.dataset.habitId = h.id;

    // Progress ring SVG
    const R = 12; const CX = 15; const CY = 15;
    const circumference = 2 * Math.PI * R;
    const dash = pct * circumference;
    const icon = document.createElement('div');
    icon.className = 'hrow-icon';
    icon.style.background = 'none';
    icon.style.border = 'none';
    icon.innerHTML = `<svg class="progress-ring" viewBox="0 0 30 30">
        <circle class="track" cx="${CX}" cy="${CY}" r="${R}"/>
        <circle class="fill" cx="${CX}" cy="${CY}" r="${R}"
            stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
            stroke-dashoffset="${(circumference / 4).toFixed(2)}"
            transform="rotate(-90 ${CX} ${CY})"/>
    </svg>`;

    const body = document.createElement('div');
    body.className = 'hrow-body';

    const name = document.createElement('div');
    name.className = 'hrow-name';
    name.textContent = h.name;

    const meta = document.createElement('div');
    meta.className = 'hrow-meta';
    const unit = h.sub_goal_unit || 'items';
    meta.innerHTML = `<span>💧 ${h._total ?? '—'} days</span><span>${doneCount}/${total} ${unit}</span>`;

    const pills = document.createElement('div');
    pills.className = 'subgoal-pills';
    for (const sg of h.sub_goals) {
        const pill = document.createElement('div');
        pill.className = 'sg-pill' + (doneDoneIds.has(sg.id) ? ' done' : '');
        pill.textContent = sg.name;
        pill.addEventListener('click', async (e) => {
            e.stopPropagation();
            const prevClass = pill.className;
            pill.classList.toggle('done');
            try {
                await api.post(`/api/v1/habits/${h.id}/completions`, {
                    date: activeIso, date_fmt: '%Y-%m-%d', sub_goal_id: sg.id,
                });
                await refreshHabits();
            } catch (err) {
                pill.className = prevClass;
                toast(err.message, 'error');
            }
        });
        pills.appendChild(pill);
    }

    body.append(name, meta, pills);
    row.append(icon, body);
    row.addEventListener('click', (e) => {
        if (e.target.closest('.sg-pill')) return;
        selectHabit(h.id);
    });
    return row;
}

// ── Detail panel ──────────────────────────────────────────────
async function selectHabit(id) {
    selectedHabitId = id;
    renderHabitList(); // re-render to show selection

    document.getElementById('detailEmpty').style.display = 'none';
    const content = document.getElementById('detailContent');
    content.style.display = 'flex';

    // Mobile: slide detail panel in
    document.getElementById('detailPanel')?.classList.add('open');

    const h = allHabits.find(x => x.id === id);
    if (!h) return;

    document.getElementById('detailIcon').textContent = h.icon || '📌';
    document.getElementById('detailTitle').textContent = h.name;

    // Load stats
    try {
        const stats = await api.get(`/api/v1/habits/${id}/stats`);
        document.getElementById('statMonthlyCheckins').textContent  = stats.monthly_checkins;
        document.getElementById('statTotalCheckins').textContent    = stats.total;
        document.getElementById('statMonthlyRate').textContent      = `${stats.monthly_checkin_rate}%`;
        document.getElementById('statStreak').textContent           = stats.streak;
        document.getElementById('statMonthlyCompletion').textContent = stats.monthly_completion;
        document.getElementById('statTotalCompletion').textContent  = stats.total_completion;
    } catch { /* leave stale */ }

    // Mount calendar
    mountCalendar(h.id, h.sub_goals || [], h.target_count, h.records || []);

    // Render line chart
    renderDailyChart(h.target_count, h.records || []);
}

window.closeDetail = function() {
    document.getElementById('detailPanel')?.classList.remove('open');
};

// ── Detail "···" menu ─────────────────────────────────────────
function wireDetailMore() {
    const btn = document.getElementById('detailMore');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const h = allHabits.find(x => x.id === selectedHabitId);
        if (h) openHabitModal(h);
    });
}

// ── Add / refresh ─────────────────────────────────────────────
export async function refreshHabits() {
    const raw = await api.get('/api/v1/habits');
    // Enrich with streak/total from stats (batch async)
    allHabits = await Promise.all(raw.map(async h => {
        try {
            const s = await api.get(`/api/v1/habits/${h.id}/stats`);
            h._streak = s.streak;
            h._total = s.total;
        } catch { h._streak = 0; h._total = 0; }
        return h;
    }));
    renderWeekStrip();
    renderHabitList();
    updateActiveDayChip();
}

// ── Initialise ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('habitList')) return;

    refreshHabits();
    wireDetailMore();

    document.getElementById('addBtn')?.addEventListener('click', () => openHabitModal(null));
    document.getElementById('activeDayClear')?.addEventListener('click', () => {
        activeDay = null;
        renderWeekStrip();
        renderHabitList();
        updateActiveDayChip();
    });

    // Close popup on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('sgPopup').style.display = 'none';
            window.closeSgSheet?.();
        }
    });
});
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/habits.js
git commit -m "feat(js): rewrite habits.js — week strip, tag groups, sub-goal rows, split-panel detail"
```

---

## Phase 6 — `app.js` + modal wiring + misc JS

### Task 6.1: Extend `app.js` — settings drawer + habit modal sub-goal wiring

**Files:**
- Modify: `beaverhabits/static/js/app.js`

- [ ] **Step 1: Update `openSettings` and `closeSettings` to use drawer**

In `beaverhabits/static/js/app.js`, find the existing `openSettings` / `closeSettings` functions and replace them:

```javascript
window.openSettings = async () => {
    const drawer = document.getElementById('settingsDrawer');
    if (!drawer) return;
    drawer.classList.add('open');
    await loadSettings();
};
window.closeSettings = () => {
    document.getElementById('settingsDrawer')?.classList.remove('open');
};
```

(Remove any references to `settingsOv` — that overlay no longer exists.)

- [ ] **Step 2: Add habit modal functions to `app.js`**

Append to the bottom of `app.js`:

```javascript
// ── Habit modal (add / edit) ──────────────────────────────────
let _editingHabit = null;

export function openHabitModal(habit) {
    _editingHabit = habit;
    const ov = document.getElementById('habitOv');
    if (!ov) return;
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit Habit' : 'New Habit';
    document.getElementById('habitNameIn').value = habit?.name || '';
    document.getElementById('habitIconBtn').textContent = habit?.icon || '📌';
    document.getElementById('habitTagIn').value = habit?.tags?.[0] || '';
    document.getElementById('habitDeleteBtn').style.visibility = habit ? 'visible' : 'hidden';

    // Sub-goals
    const hasSubgoals = (habit?.sub_goals?.length || 0) > 0;
    document.getElementById('habitSubgoalToggle').checked = hasSubgoals;
    document.getElementById('subgoalSection').style.display = hasSubgoals ? 'flex' : 'none';
    document.getElementById('habitUnitIn').value = habit?.sub_goal_unit || '';
    renderSgModalList(habit?.sub_goals || []);

    ov.classList.add('on');
    document.getElementById('habitNameIn').focus();
}
window.openHabitModal = openHabitModal;

window.closeHabitModal = () => {
    document.getElementById('habitOv')?.classList.remove('on');
    _editingHabit = null;
};

window.toggleSubgoalSection = () => {
    const on = document.getElementById('habitSubgoalToggle').checked;
    document.getElementById('subgoalSection').style.display = on ? 'flex' : 'none';
    if (on && document.getElementById('sgModalList').children.length === 0) {
        addSubgoalRow();
    }
    updateSgPreview();
};

function renderSgModalList(subGoals) {
    const list = document.getElementById('sgModalList');
    list.innerHTML = '';
    subGoals.forEach(sg => appendSgRow(sg.name));
    if (window.Sortable) {
        new Sortable(list, { animation: 150, handle: '.sg-drag-handle' });
    }
    updateSgPreview();
}

window.addSubgoalRow = function(name = '') {
    appendSgRow(name);
    updateSgPreview();
};

function appendSgRow(name) {
    const list = document.getElementById('sgModalList');
    const item = document.createElement('div');
    item.className = 'sg-list-item';
    item.innerHTML = `
        <span class="sg-drag-handle">⠿</span>
        <input type="text" placeholder="Sub-goal name" value="${name.replace(/"/g, '&quot;')}">
        <button type="button" onclick="this.closest('.sg-list-item').remove();updateSgPreview()">✕</button>`;
    item.querySelector('input').addEventListener('input', updateSgPreview);
    list.appendChild(item);
}

window.updateSgPreview = function() {
    const names = [...document.querySelectorAll('#sgModalList input')].map(i => i.value.trim()).filter(Boolean);
    const unit = document.getElementById('habitUnitIn')?.value || 'items';
    document.getElementById('sgPreview').textContent = `Preview: 0 / ${names.length} ${unit}`;
};

document.getElementById('habitUnitIn')?.addEventListener('input', window.updateSgPreview);

window.saveHabit = async function() {
    const name = document.getElementById('habitNameIn').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }

    const icon = document.getElementById('habitIconBtn').textContent;
    const tag = document.getElementById('habitTagIn').value.trim();
    const hasSubgoals = document.getElementById('habitSubgoalToggle').checked;

    let sub_goals = [];
    let sub_goal_unit = null;
    if (hasSubgoals) {
        const names = [...document.querySelectorAll('#sgModalList input')].map(i => i.value.trim()).filter(Boolean);
        if (names.length === 0) { toast('Add at least one sub-goal', 'error'); return; }
        sub_goals = names.map(n => ({ id: n.toLowerCase().replace(/\s+/g, '_'), name: n }));
        sub_goal_unit = document.getElementById('habitUnitIn').value.trim() || 'items';
    }

    const body = {
        name, icon,
        tags: tag ? [tag] : [],
        sub_goals,
        ...(sub_goal_unit && { sub_goal_unit }),
    };

    try {
        if (_editingHabit) {
            await api.put(`/api/v1/habits/${_editingHabit.id}`, body);
        } else {
            await api.post('/api/v1/habits', body);
        }
        toast(_editingHabit ? 'Saved' : 'Created');
        window.closeHabitModal();
        const { refreshHabits } = await import('/static/js/habits.js');
        await refreshHabits();
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteCurrentHabit = async function() {
    if (!_editingHabit) return;
    if (!confirm(`Delete "${_editingHabit.name}"? This cannot be undone.`)) return;
    try {
        await api.delete(`/api/v1/habits/${_editingHabit.id}`);
        window.closeHabitModal();
        const { refreshHabits } = await import('/static/js/habits.js');
        await refreshHabits();
        toast('Deleted');
    } catch (e) { toast(e.message, 'error'); }
};

// Icon picker (simple — just text input for now; emoji typed directly)
window.openIconPicker = function() {
    document.getElementById('habitIconBtn').focus();
};
```

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/static/js/app.js
git commit -m "feat(js): app.js — settings drawer, habit modal wiring with sub-goal support"
```

---

### Task 6.2: Update `heatmap.js` CSS class names; update `heatmap.html`

**Files:**
- Modify: `beaverhabits/static/js/heatmap.js`
- Modify: `beaverhabits/templates/heatmap.html`

- [ ] **Step 1: Update class names in `heatmap.js`**

In `beaverhabits/static/js/heatmap.js`, replace every instance of `'hm-cell'` (the base class) with `'hm-cell'` (same — already matches new CSS). Replace level classes:

```bash
# Check what class names are currently used for level cells
grep -n "classList\|className" beaverhabits/static/js/heatmap.js
```

Look at the output. If the existing `heatmap.js` uses `.hm-cell.l1` through `.l4`, those still exist in the new CSS. If it uses `.hm-cell.done` or `.l3` for multi-year, update to `.l3`. Verify the final CSS and update to match.

- [ ] **Step 2: Rewrite `heatmap.html`**

Replace the contents of `beaverhabits/templates/heatmap.html`:

```html
{% extends "base.html" %}
{% block title %}{{ habit.name }} · Heatmap · HabitLab{% endblock %}
{% block nav_stats %}active{% endblock %}

{% block panels %}
<div class="list-panel" style="width:100%;max-width:100%">
    <div class="list-topbar">
        <a href="/" style="color:var(--accent-light);font-size:13px;text-decoration:none">← Back</a>
        <span class="list-topbar-title" style="margin-left:8px">{{ habit.name }} — Multi-year heatmap</span>
    </div>
    <div class="heatmap-page" id="multiYearRoot" data-habit-id="{{ habit.id }}"></div>
</div>
{% endblock %}

{% block scripts %}
<script type="module">
    import { renderMultiYearHeatmap } from '/static/js/heatmap.js';
    renderMultiYearHeatmap();
</script>
{% endblock %}
```

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/static/js/heatmap.js beaverhabits/templates/heatmap.html
git commit -m "feat(templates/js): update heatmap.html and heatmap.js for new CSS class names"
```

---

### Task 6.3: Final smoke test

- [ ] **Step 1: Run backend tests**

```bash
uv run pytest tests/ -q
```
Expected: all passing.

- [ ] **Step 2: Start the dev server**

```bash
uv run uvicorn beaverhabits.main:app --reload --port 8765
```

- [ ] **Step 3: Walk through the app manually**

Open `http://localhost:8765` in a browser and verify:

- [ ] Login page renders centered card, blue button
- [ ] After login: nav rail (46px) visible with icons; list panel (~340px) on left; detail panel on right shows "Select a habit" empty state
- [ ] Week strip shows 7 days, today highlighted blue
- [ ] "+ " button opens habit modal; can create regular habit; saves; appears in list grouped by tag
- [ ] Create a sub-goal habit (e.g. Salah, 5 sub-goals, unit "prayers") — appears in list with progress ring + pills
- [ ] Tapping a pill toggles it; ring progress updates
- [ ] Clicking a habit row opens detail: title, 6 stat cards, monthly circle calendar, daily chart
- [ ] Monthly calendar: tapping a day on regular habit toggles ✓; tapping on sub-goal habit shows popup (desktop) or bottom sheet (mobile <768px)
- [ ] Settings gear opens slide-in drawer from right
- [ ] Mobile: list panel fills screen; tapping a habit slides in detail panel; back button closes it
- [ ] Heatmap page (`/heatmap/:id`) renders correctly

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: post-smoke fixes after TickTick redesign"
```

---

## Self-review

**Spec coverage check:**

| Spec section | Tasks covering it |
|---|---|
| 2. Design system (colors, typography, spacing) | Task 2.1 |
| 3. Split-panel layout (nav rail + list + detail) | Tasks 3.1, 3.2, 5.1 |
| 4. Navigation rail | Tasks 3.1, 2.1 |
| 5. List panel — top bar, week strip, groups, regular row, sub-goal row | Tasks 3.2, 5.1 |
| 6. Detail panel — stat cards, monthly calendar, line chart | Tasks 3.2, 4.1, 4.2, 5.2 (selectHabit in habits.js) |
| 7. Add/Edit modal — sub-goals, drag-reorder, unit label | Tasks 3.3, 6.1 |
| 8. Login page | Task 3.4 |
| 9. Settings drawer | Tasks 3.4 (template), 6.1 (app.js) |
| 10. Data model — sub_goals, sub_goal_unit, sub_goals_done | Tasks 1.1, 1.2, 1.3 |
| 11. Frontend file changes | All phases |
| 12. What is NOT changing (api.js, routes, storage core) | Preserved throughout |

**Placeholder scan:** No TBD/TODO/placeholder left in code above. All code is complete.

**Type consistency check:**
- `sub_goals` always `[{id, name}]` — consistent across storage, API, JS
- `sub_goals_done` always `[string]` (list of IDs) — consistent in storage, API response, JS
- `mountCalendar(habitId, subGoals, target, records)` — called from `selectHabit()` with `h.sub_goals || []`, `h.target_count`, `h.records || []` ✓
- `renderDailyChart(target, records)` — called from `selectHabit()` with `h.target_count`, `h.records || []` ✓
- `openHabitModal(habit | null)` — called from `addBtn` with `null`, from `detailMore` with `h` ✓

**Gap found:** `notes.js` selectors reference `noteOv` — still compatible with `_note_modal.html` which uses `id="noteOv"`. ✓ No changes needed.

**Gap found:** `stats.html` page template (used by `/stats` route) still extends old `base.html` — after Task 3.1, the `{% block panels %}` block replaces `{% block content %}`. Update `stats.html`:

```html
{% extends "base.html" %}
{% block title %}Stats · HabitLab{% endblock %}
{% block nav_stats %}active{% endblock %}

{% block panels %}
<div class="list-panel" style="width:100%;max-width:100%">
    <div class="list-topbar">
        <span class="list-topbar-title">Stats</span>
    </div>
    <div style="padding:20px;overflow-y:auto;flex:1" id="statsRoot">Loading…</div>
</div>
{% endblock %}

{% block scripts %}
<script type="module">
    import { api } from '/static/js/api.js';
    api.get('/api/v1/habits').then(habits => {
        document.getElementById('statsRoot').innerHTML =
            `<p style="color:var(--text-secondary)">${habits.length} habit${habits.length !== 1 ? 's' : ''} tracked.</p>`;
    });
</script>
{% endblock %}
```

Add this as **Task 3.2b** between Task 3.2 and 3.3 (or fold into Task 3.2 commit).
