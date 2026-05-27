# Today Tab Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Today tab from scratch — server-side tasks + server-side habit pins, same data on all devices, Lockbox mutation pattern throughout.

**Architecture:** Storage lives in the existing JSON blob (`DictHabitList.data`). Tasks are a flat list under `"tasks"`, pinned habit IDs under `"today_pinned"`. Four task endpoints + an extended `/habits/meta` endpoint handle all server communication. `today.js` is a single-module SPA: `loadAll()` → `render()` → Lockbox mutations, no optimistic updates.

**Tech Stack:** FastAPI + SQLAlchemy (backend), Jinja2 (template shell), Vanilla JS ES modules (frontend), pytest + httpx (tests)

**Notify on each task completion:** `curl -s -H 'Title: Claude Code' -d 'Task complete: [task name]' ntfy.sh/mjlabclaude`

---

## File Map

| File | Change |
|---|---|
| `beaverhabits/storage/storage.py` | Add task method stubs + `today_pinned` property stubs to `HabitList` protocol |
| `beaverhabits/storage/dict.py` | Add `today_pinned` property + `get/add/update/delete_task` methods to `DictHabitList` |
| `beaverhabits/routes/api.py` | Extend `HabitListMeta` with `pinned_today_ids`; update `get/put_habits_meta`; add 4 task endpoints |
| `beaverhabits/routes/pages.py` | Add `/today` page route |
| `beaverhabits/templates/base.html` | Re-add Today nav link in desktop rail + mobile tab bar |
| `beaverhabits/templates/today.html` | Create — two-column shell |
| `beaverhabits/static/js/today.js` | Create — full Lockbox implementation |
| `beaverhabits/static/css/styles.css` | Add Today tab layout + task row styles |
| `tests/test_today_storage.py` | Create — unit tests for dict.py additions |
| `tests/test_today_api.py` | Create — integration tests for task + meta endpoints |

---

## Task 1: Storage layer — task methods + today_pinned

**Files:**
- Modify: `beaverhabits/storage/storage.py`
- Modify: `beaverhabits/storage/dict.py`
- Create: `tests/test_today_storage.py`

- [ ] **Step 1.1: Write failing storage unit tests**

Create `tests/test_today_storage.py`:

```python
import datetime
import pytest
from beaverhabits.storage.dict import DictHabitList


@pytest.fixture
def hl():
    return DictHabitList({"habits": []})


def test_today_pinned_default_empty(hl):
    assert hl.today_pinned == []


def test_today_pinned_set_and_get(hl):
    hl.today_pinned = ["abc", "def"]
    assert hl.today_pinned == ["abc", "def"]


def test_today_pinned_persists_in_data(hl):
    hl.today_pinned = ["x"]
    assert hl.data["today_pinned"] == ["x"]


def test_add_task_returns_task(hl):
    task = hl.add_task("Do laundry", "2026-05-26")
    assert task["text"] == "Do laundry"
    assert task["date"] == "2026-05-26"
    assert task["done"] is False
    assert len(task["id"]) == 8


def test_get_tasks_returns_tasks_for_date(hl):
    hl.add_task("Task A", "2026-05-26")
    hl.add_task("Task B", "2026-05-25")
    tasks = hl.get_tasks("2026-05-26")
    assert len(tasks) == 1
    assert tasks[0]["text"] == "Task A"


def test_update_task_done(hl):
    task = hl.add_task("Toggle me", "2026-05-26")
    updated = hl.update_task(task["id"], done=True)
    assert updated is not None
    assert updated["done"] is True
    assert hl.get_tasks("2026-05-26")[0]["done"] is True


def test_update_task_text(hl):
    task = hl.add_task("Old text", "2026-05-26")
    updated = hl.update_task(task["id"], text="New text")
    assert updated["text"] == "New text"


def test_update_nonexistent_task_returns_none(hl):
    assert hl.update_task("nonexistent", done=True) is None


def test_delete_task(hl):
    task = hl.add_task("Delete me", "2026-05-26")
    deleted = hl.delete_task(task["id"])
    assert deleted is True
    assert hl.get_tasks("2026-05-26") == []


def test_delete_nonexistent_task_returns_false(hl):
    assert hl.delete_task("nonexistent") is False


def test_carry_forward_undone_tasks(hl):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    task = hl.add_task("Carry me", yesterday)

    # Without carry: not visible today
    assert hl.get_tasks(today) == []

    # With carry: appears with carriedFrom set
    carried = hl.get_tasks(today, carry=True)
    assert len(carried) == 1
    assert carried[0]["carriedFrom"] == yesterday


def test_done_tasks_not_carried(hl):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    task = hl.add_task("Done yesterday", yesterday)
    hl.update_task(task["id"], done=True)

    carried = hl.get_tasks(today, carry=True)
    assert carried == []


def test_tasks_older_than_14_days_not_carried(hl):
    today = datetime.date.today().isoformat()
    old = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    hl.add_task("Too old", old)

    carried = hl.get_tasks(today, carry=True)
    assert carried == []


def test_carry_does_not_duplicate_todays_tasks(hl):
    today = datetime.date.today().isoformat()
    task = hl.add_task("Today task", today)

    results = hl.get_tasks(today, carry=True)
    assert len(results) == 1
```

- [ ] **Step 1.2: Run tests — verify they fail**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_storage.py -v 2>&1 | head -30
```

Expected: `AttributeError: 'DictHabitList' object has no attribute 'today_pinned'` (or similar)

- [ ] **Step 1.3: Add protocol stubs to `storage.py`**

In `beaverhabits/storage/storage.py`, after `def delete_note(self, note_id: str) -> bool: ...`, add:

```python
    # ── Tasks ──────────────────────────────────────────────────────────────────

    def get_tasks(self, date: str, carry: bool = False) -> list[dict]: ...

    def add_task(self, text: str, date: str) -> dict: ...

    def update_task(self, task_id: str, **fields) -> dict | None: ...

    def delete_task(self, task_id: str) -> bool: ...

    @property
    def today_pinned(self) -> list[str]: ...

    @today_pinned.setter
    def today_pinned(self, value: list[str]) -> None: ...
```

- [ ] **Step 1.4: Add implementations to `dict.py`**

In `beaverhabits/storage/dict.py`, after the `delete_note` method (end of `DictHabitList`), add:

```python
    # ── Today pinned ───────────────────────────────────────────────────────────

    @property
    def today_pinned(self) -> list[str]:
        return self.data.setdefault("today_pinned", [])

    @today_pinned.setter
    def today_pinned(self, value: list[str]) -> None:
        self.data["today_pinned"] = list(value)

    # ── Tasks ──────────────────────────────────────────────────────────────────

    def get_tasks(self, date: str, carry: bool = False) -> list[dict]:
        tasks = self.data.setdefault("tasks", [])
        result = [dict(t) for t in tasks if t["date"] == date]
        if carry:
            cutoff = (
                datetime.date.fromisoformat(date) - datetime.timedelta(days=14)
            ).isoformat()
            today_ids = {t["id"] for t in result}
            for t in tasks:
                if (
                    t["date"] < date
                    and t["date"] >= cutoff
                    and not t["done"]
                    and t["id"] not in today_ids
                ):
                    carried = dict(t)
                    carried["carriedFrom"] = t["date"]
                    result.append(carried)
        return result

    def add_task(self, text: str, date: str) -> dict:
        task: dict = {
            "id": uuid.uuid4().hex[:8],
            "text": text.strip(),
            "done": False,
            "date": date,
        }
        self.data.setdefault("tasks", []).append(task)
        return dict(task)

    def update_task(self, task_id: str, **fields) -> dict | None:
        for task in self.data.get("tasks", []):
            if task["id"] == task_id:
                if "done" in fields:
                    task["done"] = bool(fields["done"])
                if "text" in fields and fields["text"] is not None:
                    task["text"] = fields["text"].strip()
                return dict(task)
        return None

    def delete_task(self, task_id: str) -> bool:
        tasks = self.data.get("tasks", [])
        before = len(tasks)
        self.data["tasks"] = [t for t in tasks if t["id"] != task_id]
        return len(self.data["tasks"]) < before
```

- [ ] **Step 1.5: Run tests — verify they pass**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_storage.py -v
```

Expected: all 13 tests PASS

- [ ] **Step 1.6: Run full test suite — no regressions**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest --tb=short -q
```

Expected: all existing tests still PASS

- [ ] **Step 1.7: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/storage/storage.py beaverhabits/storage/dict.py tests/test_today_storage.py && git commit -m "feat: add task storage and today_pinned to DictHabitList"
```

- [ ] **Step 1.8: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: Storage layer — task methods + today_pinned' ntfy.sh/mjlabclaude
```

---

## Task 2: Task API endpoints

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Create: `tests/test_today_api.py`

- [ ] **Step 2.1: Write failing API tests**

Create `tests/test_today_api.py`:

```python
import datetime
import pytest


@pytest.mark.asyncio
async def test_get_tasks_empty(authed_client):
    resp = await authed_client.get("/api/v1/tasks?date=2026-05-26")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_post_task_creates_task(authed_client):
    resp = await authed_client.post(
        "/api/v1/tasks", json={"text": "Test task", "date": "2026-05-26"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Test task"
    assert data["date"] == "2026-05-26"
    assert data["done"] is False
    assert "id" in data


@pytest.mark.asyncio
async def test_post_task_empty_text_rejected(authed_client):
    resp = await authed_client.post(
        "/api/v1/tasks", json={"text": "   ", "date": "2026-05-26"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_tasks_invalid_date_rejected(authed_client):
    resp = await authed_client.get("/api/v1/tasks?date=not-a-date")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_task_toggles_done(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Toggle me", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": True})
    assert resp.status_code == 200
    assert resp.json()["done"] is True

    resp2 = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": False})
    assert resp2.json()["done"] is False


@pytest.mark.asyncio
async def test_patch_task_updates_text(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Old text", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"text": "New text"})
    assert resp.status_code == 200
    assert resp.json()["text"] == "New text"


@pytest.mark.asyncio
async def test_patch_nonexistent_task_returns_404(authed_client):
    resp = await authed_client.patch("/api/v1/tasks/nonexistent", json={"done": True})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_task(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Delete me", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.delete(f"/api/v1/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    get = await authed_client.get("/api/v1/tasks?date=2026-05-26")
    assert all(t["id"] != task_id for t in get.json())


@pytest.mark.asyncio
async def test_delete_nonexistent_task_returns_404(authed_client):
    resp = await authed_client.delete("/api/v1/tasks/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_tasks_carry_forward(authed_client):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Carry me", "date": yesterday}
    )
    task_id = create.json()["id"]

    # Without carry — not visible today
    no_carry = await authed_client.get(f"/api/v1/tasks?date={today}")
    assert all(t["id"] != task_id for t in no_carry.json())

    # With carry — visible with carriedFrom
    with_carry = await authed_client.get(f"/api/v1/tasks?date={today}&carry=true")
    carried = [t for t in with_carry.json() if t["id"] == task_id]
    assert len(carried) == 1
    assert carried[0]["carriedFrom"] == yesterday


@pytest.mark.asyncio
async def test_done_tasks_not_carried(authed_client):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Done task", "date": yesterday}
    )
    task_id = create.json()["id"]
    await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": True})

    resp = await authed_client.get(f"/api/v1/tasks?date={today}&carry=true")
    assert all(t["id"] != task_id for t in resp.json())
```

- [ ] **Step 2.2: Run tests — verify they fail**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_api.py -v 2>&1 | head -20
```

Expected: `404 Not Found` for all routes (endpoints don't exist yet)

- [ ] **Step 2.3: Add task endpoints to `api.py`**

In `beaverhabits/routes/api.py`, after the notes section (before `def init_api_routes`), add:

```python
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
```

- [ ] **Step 2.4: Run tests — verify they pass**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_api.py -v
```

Expected: all 11 tests PASS

- [ ] **Step 2.5: Run full test suite**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest --tb=short -q
```

Expected: all tests PASS

- [ ] **Step 2.6: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/routes/api.py tests/test_today_api.py && git commit -m "feat: add task CRUD API endpoints"
```

- [ ] **Step 2.7: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: Task API endpoints' ntfy.sh/mjlabclaude
```

---

## Task 3: Extend /habits/meta with pinned_today_ids

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Modify: `tests/test_today_api.py`

- [ ] **Step 3.1: Add failing meta tests to `tests/test_today_api.py`**

Append to the end of `tests/test_today_api.py`:

```python
@pytest.mark.asyncio
async def test_get_habits_meta_includes_pinned_today_ids(authed_client):
    resp = await authed_client.get("/api/v1/habits/meta")
    assert resp.status_code == 200
    data = resp.json()
    assert "pinned_today_ids" in data
    assert data["pinned_today_ids"] == []


@pytest.mark.asyncio
async def test_put_habits_meta_sets_pinned_today_ids(authed_client, habit):
    resp = await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    assert resp.status_code == 200

    get = await authed_client.get("/api/v1/habits/meta")
    assert habit["id"] in get.json()["pinned_today_ids"]


@pytest.mark.asyncio
async def test_put_habits_meta_order_unaffected_by_pinned_update(authed_client, habit):
    # Set order first
    await authed_client.put("/api/v1/habits/meta", json={"order": [habit["id"]]})
    # Update only pins
    await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["order"] == [habit["id"]]
    assert get.json()["pinned_today_ids"] == [habit["id"]]


@pytest.mark.asyncio
async def test_put_habits_meta_can_clear_pinned(authed_client, habit):
    await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    await authed_client.put("/api/v1/habits/meta", json={"pinned_today_ids": []})
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["pinned_today_ids"] == []
```

- [ ] **Step 3.2: Run new tests — verify they fail**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_api.py::test_get_habits_meta_includes_pinned_today_ids tests/test_today_api.py::test_put_habits_meta_sets_pinned_today_ids -v
```

Expected: FAIL — `pinned_today_ids` not in response yet

- [ ] **Step 3.3: Update `HabitListMeta` and the meta handlers in `api.py`**

Find `class HabitListMeta` in `api.py` and replace it:

```python
class HabitListMeta(BaseModel):
    order: list[str] | None = None
    pinned_today_ids: list[str] | None = None
```

Find `async def get_habits_meta` and replace with:

```python
@api_router.get("/habits/meta", tags=["habits"])
async def get_habits_meta(
    habit_list: HabitList = Depends(current_habit_list),
):
    return HabitListMeta(
        order=habit_list.order,
        pinned_today_ids=habit_list.today_pinned,
    )
```

Find `async def put_habits_meta` and replace with:

```python
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
```

- [ ] **Step 3.4: Run tests — verify they pass**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest tests/test_today_api.py -v
```

Expected: all 15 tests PASS

- [ ] **Step 3.5: Run full test suite**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest --tb=short -q
```

Expected: all tests PASS

- [ ] **Step 3.6: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/routes/api.py tests/test_today_api.py && git commit -m "feat: extend /habits/meta with pinned_today_ids"
```

- [ ] **Step 3.7: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: Meta endpoint — pinned_today_ids' ntfy.sh/mjlabclaude
```

---

## Task 4: Page route + templates

**Files:**
- Modify: `beaverhabits/routes/pages.py`
- Modify: `beaverhabits/templates/base.html`
- Create: `beaverhabits/templates/today.html`

No automated tests for template rendering — smoke-test manually at the end of Task 6.

- [ ] **Step 4.1: Add `/today` route to `pages.py`**

In `beaverhabits/routes/pages.py`, inside `init_page_routes`, after the `/notes` route, add:

```python
    @app.get("/today", response_class=HTMLResponse)
    async def today_page(request: Request):
        return templates.TemplateResponse(
            "today.html", {"request": request}, headers=NO_CACHE_HEADERS
        )
```

- [ ] **Step 4.2: Add Today nav links to `base.html`**

In `beaverhabits/templates/base.html`, in the desktop nav rail, after the Notes link (the `<a href="/notes" ...>` block), add:

```html
        <a href="/today" class="nav-item {% block nav_today %}{% endblock %}" title="Today">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </a>
```

In the mobile tab bar, after the Notes tab (`<a href="/notes" ...>` block), add:

```html
        <a href="/today" class="mobile-tab {{ self.nav_today() }}" title="Today">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Today</span>
        </a>
```

- [ ] **Step 4.3: Create `today.html`**

Create `beaverhabits/templates/today.html`:

```html
{% extends "base.html" %}
{% block title %}Today — HabitLab{% endblock %}
{% block nav_today %}active{% endblock %}

{% block panels %}
<div class="today-wrap">

    <div class="today-list-col">
        <div id="todayDateNav" class="today-date-nav"></div>
        <div class="today-progress-bar">
            <div id="todayProgressFill" class="today-progress-fill"></div>
        </div>
        <div id="todayPins"></div>
        <div id="todayList"></div>
        <div id="todayAddRow"></div>
    </div>

    <div class="today-stats-col" id="todayStatsPanel"></div>

</div>
{% endblock %}

{% block scripts %}
<script type="module" src="/static/js/today.js?v={{ asset_version }}"></script>
{% endblock %}
```

- [ ] **Step 4.4: Verify server starts without errors**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run uvicorn beaverhabits.main:app --port 8765 &
sleep 2 && curl -s -o /dev/null -w "%{http_code}" http://localhost:8765/today
kill %1 2>/dev/null
```

Expected: `200` (or `302` redirect to login — either is correct)

- [ ] **Step 4.5: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/routes/pages.py beaverhabits/templates/base.html beaverhabits/templates/today.html && git commit -m "feat: add /today route, today.html shell, Today nav links"
```

- [ ] **Step 4.6: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: Page route + templates' ntfy.sh/mjlabclaude
```

---

## Task 5: CSS — Today tab styles

**Files:**
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 5.1: Add Today tab CSS to the end of `styles.css`**

Append to the very end of `beaverhabits/static/css/styles.css`:

```css
/* ── Today Tab ──────────────────────────────────────────────────────────────── */

.today-wrap {
    display: flex;
    height: 100%;
    overflow: hidden;
}

.today-list-col {
    width: 420px;
    min-width: 280px;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    padding: 1rem;
    overflow-y: auto;
    border-right: 1px solid var(--border);
}

.today-stats-col {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
}

/* Hide stats column on mobile */
@media (max-width: 700px) {
    .today-list-col {
        width: 100%;
        border-right: none;
    }
    .today-stats-col {
        display: none;
    }
}

/* Date nav */
.today-date-nav {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
}

.today-nav-btn {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem 0.6rem;
    line-height: 1;
}

.today-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
}

.today-nav-btn:hover:not(:disabled) {
    background: var(--bg-input);
}

.today-date-label {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
    flex: 1;
}

/* Past day banner */
.today-past-banner {
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-bottom: 0.75rem;
}

.today-past-banner a {
    color: var(--accent-light);
    text-decoration: none;
}

.today-past-banner a:hover {
    text-decoration: underline;
}

/* Progress bar */
.today-progress-bar {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    margin-bottom: 1.25rem;
    overflow: hidden;
}

.today-progress-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 2px;
    transition: width 0.3s ease;
}

/* Section headers */
.today-section-header {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    margin: 0.75rem 0 0.4rem;
}

/* Task rows */
.task-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0.25rem;
    border-radius: 6px;
    transition: opacity 0.15s;
}

.task-row:hover {
    background: var(--bg-elevated);
}

.task-row.busy {
    opacity: 0.5;
    pointer-events: none;
}

.task-row.done .task-text {
    text-decoration: line-through;
    color: var(--text-muted);
}

.task-cb {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    accent-color: var(--accent);
    cursor: pointer;
}

.task-text {
    flex: 1;
    font-size: 0.9rem;
    color: var(--text-primary);
    word-break: break-word;
}

.task-del-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 1rem;
    line-height: 1;
    padding: 0 0.2rem;
    opacity: 0;
    transition: opacity 0.15s;
}

.task-row:hover .task-del-btn {
    opacity: 1;
}

.task-del-btn:hover {
    color: var(--danger);
}

/* Habit pin rows */
.habit-pin-row {
    cursor: pointer;
}

/* Sub-goal pills */
.sg-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.25rem 0 0.5rem 2.2rem;
}

.sg-pill {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.75rem;
    padding: 0.2rem 0.7rem;
    transition: background 0.15s, color 0.15s;
}

.sg-pill.done {
    background: var(--accent-sel);
    border-color: var(--accent);
    color: var(--accent-light);
}

/* Add task input */
.today-add-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.9rem;
    margin-top: 0.75rem;
    padding: 0.55rem 0.75rem;
    outline: none;
    box-sizing: border-box;
}

.today-add-input:focus {
    border-color: var(--accent);
}

.today-add-input::placeholder {
    color: var(--text-muted);
}

/* Pin section */
.pin-section {
    margin-top: 1rem;
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
}

.pin-section summary {
    color: var(--text-muted);
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    list-style: none;
    user-select: none;
}

.pin-section summary:hover {
    color: var(--text-secondary);
}

.pin-habit-row {
    align-items: center;
    cursor: pointer;
    display: flex;
    gap: 0.5rem;
    padding: 0.35rem 0.25rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
    border-radius: 5px;
}

.pin-habit-row:hover {
    background: var(--bg-elevated);
}

/* Stats panel */
.stats-cards {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}

.stats-card {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    flex: 1;
    padding: 0.75rem;
    text-align: center;
}

.stats-card-value {
    color: var(--text-primary);
    font-size: 1.6rem;
    font-weight: 700;
    line-height: 1;
}

.stats-card-label {
    color: var(--text-muted);
    font-size: 0.7rem;
    margin-top: 0.3rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
}

.stats-section-header {
    color: var(--text-muted);
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    margin-bottom: 0.6rem;
    text-transform: uppercase;
}

.streak-row {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    padding: 0.3rem 0;
    font-size: 0.85rem;
}

.streak-name {
    color: var(--text-primary);
    flex: 1;
}

.streak-count {
    color: var(--streak);
    font-size: 0.85rem;
    font-weight: 600;
}
```

- [ ] **Step 5.2: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/static/css/styles.css && git commit -m "feat: add Today tab CSS — layout, task rows, stats panel"
```

- [ ] **Step 5.3: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: CSS — Today tab styles' ntfy.sh/mjlabclaude
```

---

## Task 6: today.js — full implementation

**Files:**
- Create: `beaverhabits/static/js/today.js`

- [ ] **Step 6.1: Create `today.js`**

Create `beaverhabits/static/js/today.js`:

```js
// beaverhabits/static/js/today.js
import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons } from '/static/js/icons.js';

// ── Utils ──────────────────────────────────────────────────────────────────────
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoAddDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return localIso(d);
}

function isoLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── State ──────────────────────────────────────────────────────────────────────
const TODAY = localIso();
let viewDay = TODAY;
let taskItems = [];   // [{ id, text, done, date, carriedFrom? }]
let allHabits = [];   // full habit array from GET /api/v1/habits
let pinnedIds = [];   // habit IDs from GET /api/v1/habits/meta .pinned_today_ids
let _inflight = 0;    // mutation guard — blocks silentRefresh while > 0
let _lastRefresh = 0; // ms timestamp of last refresh

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadAll() {
    try {
        const [tasks, habits, meta] = await Promise.all([
            api.get(`/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`),
            api.get('/api/v1/habits'),
            api.get('/api/v1/habits/meta'),
        ]);
        taskItems = tasks;
        allHabits = habits;
        pinnedIds = meta.pinned_today_ids || [];
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load', 'error');
    }
    render();
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
    renderDateNav();
    renderProgress();
    renderHabitPins();
    renderTaskList();
    renderAddRow();
    renderStatsPanel();
}

function renderDateNav() {
    const el = document.getElementById('todayDateNav');
    if (!el) return;
    el.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'today-nav-btn';
    prevBtn.textContent = '←';
    prevBtn.addEventListener('click', () => navigateDay(-1));

    const label = document.createElement('span');
    label.className = 'today-date-label';
    label.textContent = viewDay === TODAY ? 'Today' : isoLabel(viewDay);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'today-nav-btn';
    nextBtn.textContent = '→';
    nextBtn.disabled = viewDay === TODAY;
    nextBtn.addEventListener('click', () => navigateDay(1));

    el.append(prevBtn, label, nextBtn);

    // Remove existing banner if present
    document.querySelector('.today-past-banner')?.remove();

    if (viewDay !== TODAY) {
        const banner = document.createElement('div');
        banner.className = 'today-past-banner';
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = 'Jump to today';
        link.addEventListener('click', e => { e.preventDefault(); jumpToToday(); });
        banner.append('Viewing a past day — ', link);
        el.after(banner);
    }
}

function renderProgress() {
    const fill = document.getElementById('todayProgressFill');
    if (!fill) return;
    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === viewDay);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
}

function renderHabitPins() {
    const el = document.getElementById('todayPins');
    if (!el) return;
    el.innerHTML = '';

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));

    if (pinned.length > 0) {
        const header = document.createElement('div');
        header.className = 'today-section-header';
        header.textContent = 'Habits';
        el.appendChild(header);

        pinned.forEach(h => {
            const rec = h.records.find(r => r.day === viewDay);
            const isDone = rec && rec.done;
            const hasSg = h.sub_goals && h.sub_goals.length > 0;

            const row = document.createElement('div');
            row.className = 'task-row habit-pin-row' + (_inflight > 0 ? ' busy' : '') + (isDone ? ' done' : '');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-cb';
            cb.checked = isDone;
            cb.disabled = _inflight > 0;
            cb.addEventListener('change', () => toggleHabit(h));

            const iconEl = buildIconEl(h.icon || '📌', 16);

            const name = document.createElement('span');
            name.className = 'task-text';
            name.textContent = h.name;

            row.append(cb, iconEl, name);
            el.appendChild(row);

            if (hasSg) {
                const pills = document.createElement('div');
                pills.className = 'sg-pills';
                h.sub_goals.forEach(sg => {
                    const sgDone = rec?.sub_goals_done?.includes(sg.id);
                    const pill = document.createElement('button');
                    pill.className = 'sg-pill' + (sgDone ? ' done' : '');
                    pill.textContent = sg.name;
                    pill.disabled = _inflight > 0;
                    pill.addEventListener('click', () => toggleSg(h, sg.id));
                    pills.appendChild(pill);
                });
                el.appendChild(pills);
            }
        });
        applyIcons();
    }

    // Pin habits section
    const pinSection = document.createElement('details');
    pinSection.className = 'pin-section';
    const summary = document.createElement('summary');
    summary.textContent = `Pin habits to today${allHabits.length > 0 ? ` (${pinnedIds.length}/${allHabits.length})` : ''}`;
    pinSection.appendChild(summary);

    allHabits.forEach(h => {
        const row = document.createElement('label');
        row.className = 'pin-habit-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pinnedIds.includes(h.id);
        cb.addEventListener('change', () => togglePin(h.id));

        const iconEl = buildIconEl(h.icon || '📌', 14);

        const name = document.createElement('span');
        name.textContent = h.name;

        row.append(cb, iconEl, name);
        pinSection.appendChild(row);
    });

    el.appendChild(pinSection);
    applyIcons();
}

function renderTaskList() {
    const el = document.getElementById('todayList');
    if (!el) return;
    el.innerHTML = '';

    if (taskItems.length > 0) {
        const header = document.createElement('div');
        header.className = 'today-section-header';
        header.textContent = 'Tasks';
        el.appendChild(header);
    }

    taskItems.forEach(t => {
        const row = document.createElement('div');
        row.className = 'task-row' + (_inflight > 0 ? ' busy' : '') + (t.done ? ' done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-cb';
        cb.checked = t.done;
        cb.disabled = _inflight > 0;
        cb.addEventListener('change', () => toggleTask(t.id));

        const text = document.createElement('span');
        text.className = 'task-text';
        text.textContent = t.carriedFrom
            ? `${t.text} ↑ ${isoLabel(t.carriedFrom)}`
            : t.text;

        row.append(cb, text);

        if (viewDay === TODAY) {
            const delBtn = document.createElement('button');
            delBtn.className = 'task-del-btn';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', () => deleteTask(t.id));
            row.appendChild(delBtn);
        }

        el.appendChild(row);
    });
}

function renderAddRow() {
    const el = document.getElementById('todayAddRow');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'today-add-input';
    inp.placeholder = 'Add task for today…';
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && inp.value.trim()) {
            addTask(inp.value.trim());
        }
    });
    el.appendChild(inp);
}

function renderStatsPanel() {
    const el = document.getElementById('todayStatsPanel');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === TODAY);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Progress cards
    const grid = document.createElement('div');
    grid.className = 'stats-cards';
    [
        { label: 'Done', value: done },
        { label: 'Left', value: total - done },
        { label: '% Done', value: `${pct}%` },
    ].forEach(c => {
        const card = document.createElement('div');
        card.className = 'stats-card';
        const val = document.createElement('div');
        val.className = 'stats-card-value';
        val.textContent = c.value;
        const lbl = document.createElement('div');
        lbl.className = 'stats-card-label';
        lbl.textContent = c.label;
        card.append(val, lbl);
        grid.appendChild(card);
    });
    el.appendChild(grid);

    // Habit streaks
    if (pinned.length > 0) {
        const hdr = document.createElement('div');
        hdr.className = 'stats-section-header';
        hdr.textContent = 'Habit streaks';
        el.appendChild(hdr);

        pinned.forEach(h => {
            const doneSet = new Set(h.records.filter(r => r.done).map(r => r.day));
            let streak = 0, cursor = TODAY;
            while (doneSet.has(cursor)) {
                streak++;
                cursor = isoAddDays(cursor, -1);
            }

            const row = document.createElement('div');
            row.className = 'streak-row';
            const iconEl = buildIconEl(h.icon || '📌', 14);
            const name = document.createElement('span');
            name.className = 'streak-name';
            name.textContent = h.name;
            const flame = document.createElement('span');
            flame.className = 'streak-count';
            flame.textContent = `🔥 ${streak}`;
            row.append(iconEl, name, flame);
            el.appendChild(row);
        });
        applyIcons();
    }
}

// ── Day navigation ─────────────────────────────────────────────────────────────
async function navigateDay(delta) {
    viewDay = isoAddDays(viewDay, delta);
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${viewDay}&carry=false`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

async function jumpToToday() {
    viewDay = TODAY;
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${viewDay}&carry=true`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

// ── Mutations — Lockbox pattern throughout ─────────────────────────────────────
async function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (!t) return;
    _inflight++;
    render();
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { done: !t.done });
        t.done = updated.done;
    } catch (err) {
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function addTask(text) {
    _inflight++;
    render();
    try {
        const created = await api.post('/api/v1/tasks', { text, date: viewDay });
        taskItems.push(created);
    } catch (err) {
        toast(err?.message || 'Failed to add task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function deleteTask(id) {
    _inflight++;
    render();
    try {
        await api.delete(`/api/v1/tasks/${id}`);
        taskItems = taskItems.filter(t => t.id !== id);
    } catch (err) {
        toast(err?.message || 'Failed to delete task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function toggleHabit(h) {
    const rec = h.records.find(r => r.day === viewDay);
    const currentlyDone = rec && rec.done;
    _inflight++;
    render();
    try {
        const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay,
            date_fmt: '%Y-%m-%d',
            done: !currentlyDone,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done;
                existing.count = result.count;
            } else {
                habit.records.push({ day: viewDay, done: result.done, count: result.count, sub_goals_done: [] });
            }
        }
    } catch (err) {
        toast(err?.message || 'Failed to update habit', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function toggleSg(h, sgId) {
    _inflight++;
    render();
    try {
        const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay,
            date_fmt: '%Y-%m-%d',
            sub_goal_id: sgId,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done;
                existing.count = result.count;
                existing.sub_goals_done = result.sub_goals_done;
            } else {
                habit.records.push({
                    day: viewDay,
                    done: result.done,
                    count: result.count,
                    sub_goals_done: result.sub_goals_done,
                });
            }
        }
    } catch (err) {
        toast(err?.message || 'Failed to update sub-goal', 'error');
    } finally {
        _inflight--;
        render();
    }
}

// Pin toggle: update memory first (preference, not critical), then persist
async function togglePin(habitId) {
    if (pinnedIds.includes(habitId)) {
        pinnedIds = pinnedIds.filter(id => id !== habitId);
    } else {
        pinnedIds = [...pinnedIds, habitId];
    }
    render();
    try {
        await api.put('/api/v1/habits/meta', { pinned_today_ids: pinnedIds });
    } catch (err) {
        toast('Failed to save pin — reload to resync', 'error');
    }
}

// ── Silent refresh — syncs tasks across devices ────────────────────────────────
function silentRefresh() {
    if (_inflight > 0 || Date.now() - _lastRefresh < 3000) return;
    _lastRefresh = Date.now();
    (async () => {
        try {
            const fresh = await api.get(
                `/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`
            );
            if (_inflight === 0) {
                taskItems = fresh;
                render();
            }
        } catch { /* silent */ }
    })();
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    window.addEventListener('focus', silentRefresh);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) silentRefresh();
    });
});
```

- [ ] **Step 6.2: Run full test suite — no regressions**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run pytest --tb=short -q
```

Expected: all tests PASS

- [ ] **Step 6.3: Start the server and smoke-test manually**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && uv run uvicorn beaverhabits.main:app --reload --port 8765
```

Open `http://localhost:8765/today` and verify:

1. ✅ Today tab loads — date shows "Today", progress bar visible
2. ✅ Type a task name + Enter → task appears in list
3. ✅ Click checkbox → task dims (busy), then toggles to done
4. ✅ Click × → task disappears
5. ✅ Open "Pin habits to today" → check a habit → it appears in Habits section above tasks
6. ✅ Toggle a pinned habit → it toggles (and dims during request)
7. ✅ Click ← to go back a day → "Viewing a past day" banner shows, no Add input, no stats panel
8. ✅ Click "Jump to today" → returns to today view
9. ✅ Stats panel shows Done / Left / % Done on desktop
10. ✅ Open the same URL on another device / browser → same tasks and pins visible

- [ ] **Step 6.4: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab" && git add beaverhabits/static/js/today.js && git commit -m "feat: implement today.js — Lockbox mutations, task CRUD, habit pins, stats panel"
```

- [ ] **Step 6.5: Notify**

```bash
curl -s -H 'Title: Claude Code' -d 'Task complete: today.js — Today tab is live' ntfy.sh/mjlabclaude
```

---

## Done

All tasks complete. The Today tab is rebuilt from scratch:

- Tasks and pins are server-side → same data on phone and laptop
- Lockbox mutations: await server → patch state → render (no optimistic, no revert complexity)
- `silentRefresh` on focus/visibilitychange keeps cross-device data fresh
- Stats panel is zero-API (reads in-memory state only)
- Past day navigation is read-only (no add, no stats)
