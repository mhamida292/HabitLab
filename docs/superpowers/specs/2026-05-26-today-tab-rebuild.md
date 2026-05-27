# Design: Today Tab Rebuild

**Date:** 2026-05-26
**Status:** Approved
**Principle:** Server is source of truth. Same data on all devices. Keep it simple.

---

## What We're Building

A Today tab that:
1. Shows a task list for today (add / toggle / delete)
2. Shows pinned habits for today (toggle completion)
3. Navigates to past days (read-only)
4. Shows a simple stats panel on desktop (progress count only — derived from in-memory state, no extra API calls)

Everything stored server-side. No localStorage for critical data.

---

## Backend

### Task storage — `dict.py`

Tasks live in `DictHabitList.data["tasks"]` — flat list in the existing JSON blob.

```json
{ "id": "a1b2c3", "text": "Suhoor", "done": false, "date": "2026-05-26" }
```

Four methods on `DictHabitList`:

```python
def get_tasks(self, date: str, carry: bool = False) -> list[dict]:
    """Return tasks for date. If carry=True, also include undone tasks from past 14 days."""

def add_task(self, text: str, date: str) -> dict:
    """Append a new task, return it."""

def update_task(self, task_id: str, **fields) -> dict | None:
    """Update done/text on a task by id. Return updated task or None."""

def delete_task(self, task_id: str) -> bool:
    """Remove task by id. Return True if deleted."""
```

Carry-forward: tasks with `done=False` from past 14 days are included when `carry=True`, so undone tasks surface on today's view. No new field — just filtered by date range.

### Pinned habits — `dict.py`

```python
@property
def today_pinned(self) -> list[str]:
    return self.data.setdefault("today_pinned", [])

@today_pinned.setter
def today_pinned(self, value: list[str]) -> None:
    self.data["today_pinned"] = list(value)
```

### Protocol stubs — `storage.py`

Add minimal stubs to `HabitList` protocol so type checking passes:

```python
def get_tasks(self, date: str, carry: bool = False) -> list[dict]: ...
def add_task(self, text: str, date: str) -> dict: ...
def update_task(self, task_id: str, **fields) -> dict | None: ...
def delete_task(self, task_id: str) -> bool: ...

@property
def today_pinned(self) -> list[str]: ...

@today_pinned.setter
def today_pinned(self, value: list[str]) -> None: ...
```

### API endpoints — `api.py`

**Extend existing `HabitListMeta`:**
```python
class HabitListMeta(BaseModel):
    order: list[str] | None = None
    pinned_today_ids: list[str] | None = None  # ← new
```

`GET /habits/meta` returns both fields.
`PUT /habits/meta` updates whichever fields are present.

**New task endpoints:**
```
GET    /api/v1/tasks?date=YYYY-MM-DD[&carry=true]   → list of tasks
POST   /api/v1/tasks        { text, date }           → created task
PATCH  /api/v1/tasks/{id}   { done?, text? }         → updated task
DELETE /api/v1/tasks/{id}                            → { ok: true }
```

All task endpoints require auth (same `current_active_user` dependency as every other endpoint).

### Page route — `pages.py`

```python
@app.get("/today", response_class=HTMLResponse)
async def today_page(request: Request):
    return templates.TemplateResponse("today.html", {"request": request}, headers=NO_CACHE_HEADERS)
```

---

## Frontend

### Nav links — `base.html`

Add Today link to the desktop nav rail and mobile tab bar, between Habits and Notes.

Desktop rail:
```html
<a href="/today" class="nav-item {% block nav_today %}{% endblock %}" title="Today">
    <!-- calendar icon -->
</a>
```

Mobile tab bar:
```html
<a href="/today" class="mobile-tab {{ self.nav_today() }}" title="Today">
    <!-- calendar icon -->
    <span>Today</span>
</a>
```

### Template — `today.html`

Simple two-column shell. Left column is always visible; right column is desktop-only.

```html
{% extends "base.html" %}
{% block nav_today %}active{% endblock %}
{% block panels %}
<div class="today-wrap">
    <div class="today-list-col">
        <div id="todayDateNav"></div>
        <div class="today-progress-bar"><div id="todayProgressFill"></div></div>
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

### JavaScript — `today.js`

**State (module-level):**
```js
const TODAY = localIso();   // immutable — local date at page load
let viewDay  = TODAY;       // currently-viewed day (changes on nav)
let taskItems = [];         // [{ id, text, done, date, carriedFrom? }]
let allHabits = [];         // from GET /api/v1/habits
let pinnedIds = [];         // from GET /api/v1/habits/meta .pinned_today_ids
let _inflight = 0;          // blocks silentRefresh while any mutation is in flight
let _lastRefresh = 0;       // ms — throttles silentRefresh
```

**Entry point:**
```js
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    window.addEventListener('focus', silentRefresh);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) silentRefresh();
    });
});
```

**loadAll:**
```js
async function loadAll() {
    const [tasks, habits, meta] = await Promise.all([
        api.get(`/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`),
        api.get('/api/v1/habits'),
        api.get('/api/v1/habits/meta'),
    ]);
    taskItems = tasks;
    allHabits = habits;
    pinnedIds = meta.pinned_today_ids || [];
    _lastRefresh = Date.now();
    render();
}
```

`carry=true` only when viewing today — past day navigation shows exactly that day's tasks, no carry-forward.
```

**Render pipeline:**
```js
function render() {
    renderDateNav();
    renderProgress();
    renderHabitPins();
    renderTaskList();
    renderAddRow();
    renderStatsPanel();
}
```

Each sub-render reads from module-level state only — no arguments, no side effects.

**Lockbox mutation pattern (all mutations follow this):**
```js
async function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (!t) return;
    _inflight++;
    render();  // _inflight > 0 → add .busy class to list → dim + pointer-events: none
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
```

**silentRefresh:**
```js
function silentRefresh() {
    if (_inflight > 0 || Date.now() - _lastRefresh < 3000) return;
    _lastRefresh = Date.now();
    (async () => {
        try {
            const fresh = await api.get(`/api/v1/tasks?date=${viewDay}&carry=true`);
            if (_inflight === 0) { taskItems = fresh; render(); }
        } catch { /* silent */ }
    })();
}
```

**Day navigation:**
- Prev button: `viewDay = isoAddDays(viewDay, -1)` → re-fetch tasks → render
- Next button: disabled when `viewDay === TODAY`
- Past day: hide Add row, hide stats panel, show banner "Viewing [date] — tap to return to today"

**Pinned habits:**
- Each pinned habit row shows icon + name + checkbox (done for today)
- Below the task list: "Pin habits" section — list of all habits with toggle checkboxes
- Toggling a pin: update `pinnedIds` in memory → `PUT /api/v1/habits/meta { pinned_today_ids }` → render
  - This is the one place we update memory first (not Lockbox) because pins are a preference, not critical data. If the PUT fails, show a toast — state is already correct in memory for this session, and will re-sync on next page load.
- Toggling completion on a pinned habit: Lockbox → `POST /api/v1/habits/{id}/completions` → patch `allHabits` in memory → render

**Stats panel (desktop only, today only):**
Three plain numbers derived from in-memory state. No API calls.
- Tasks done / Tasks total
- Habits done / Habits pinned
- Overall % complete

Hidden entirely when `viewDay !== TODAY`.

---

## CSS additions — `styles.css`

Minimal additions:
- `.today-wrap` — flex row, gap
- `.today-list-col` — max-width 420px, flex column
- `.today-stats-col` — flex 1, hidden on mobile (`display: none` below breakpoint)
- `.today-progress-bar` / `#todayProgressFill` — thin accent bar
- `.task-row` — flex row, gap, align-center
- `.task-row.busy` — opacity 0.5, pointer-events: none (while _inflight > 0)
- `.today-past-banner` — muted text banner for past-day mode
- `.pin-section` — collapsible list of habits to pin

All tokens from the existing system: `var(--bg-surface)`, `var(--accent)`, `var(--text-primary)`, etc.

---

## Files Changed

| File | Change |
|---|---|
| `beaverhabits/storage/storage.py` | Add task method stubs + today_pinned stubs to HabitList protocol |
| `beaverhabits/storage/dict.py` | Add today_pinned property + get/add/update/delete_task methods |
| `beaverhabits/routes/api.py` | Extend HabitListMeta + add 4 task endpoints |
| `beaverhabits/routes/pages.py` | Add /today route |
| `beaverhabits/templates/base.html` | Re-add Today nav link (rail + mobile tab) |
| `beaverhabits/templates/today.html` | Create — two-column shell |
| `beaverhabits/static/js/today.js` | Create — Lockbox pattern throughout |
| `beaverhabits/static/css/styles.css` | Add Today tab layout + task row styles |

---

## What's Explicitly Out of Scope

- No migration from localStorage (old data is 14+ days stale — skip it)
- No drag-to-reorder on tasks (can add later if needed)
- No task due dates beyond the current day
- No weekly bar chart in stats panel (just counts — keep it simple)
- No per-task inflight tracking — whole list dims while any mutation is in flight
