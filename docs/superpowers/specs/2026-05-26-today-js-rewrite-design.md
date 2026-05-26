# Design: today.js Rewrite

**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** Replace `beaverhabits/static/js/today.js` with a clean implementation that matches the data-mutation pattern already used in `habits.js`.

---

## Problem

The existing `today.js` accumulated complexity through incremental migrations (localStorage → server-side storage). The task toggle was broken — clicking a task showed a red error toast and did nothing. Root causes included a per-task `_pending` flag getting stuck, a `_mutating` counter interacting badly with `silentRefresh`, and stale click listeners after DOM rebuilds.

---

## Consistency Goal

`habits.js` uses one pattern for every mutation:

1. **Optimistic visual** — update the DOM element class/style immediately (before `await`)
2. `await api.call(...)` — send to server
3. **Patch in-memory state** — update the array entry with server's response (no re-fetch)
4. **Re-render** — call `render()` to rebuild from updated state
5. **Revert + toast on error** — restore the previous visual, show error

`today.js` will use exactly this pattern for all task mutations. No separate `_pending` per-task flag. No `_mutating` counter. One guard only: `_busy` (boolean), which blocks `silentRefresh` during any in-flight mutation.

---

## Architecture

### State (module-level)

```js
const TODAY   = localIso();         // immutable, set once at load
let viewDay   = TODAY;              // currently-viewed day (changes on nav)
let taskItems = [];                 // [{id, text, done, carriedFrom?}]
let allHabits = [];                 // full habit array from API
let pinnedIds = [];                 // habit IDs pinned to today (localStorage)
let _busy     = false;              // true while any mutation is in-flight
let _lastRefresh = 0;              // ms timestamp of last silentRefresh
```

### Functions

| Function | Purpose |
|---|---|
| `localIso(d?)` | Local `YYYY-MM-DD` string — never `toISOString()` |
| `isoAddDays(iso, n)` | Offset a date string by ±n days |
| `fetchTasks(date, carry)` | `GET /api/v1/tasks?date=&carry=` → array |
| `loadAll()` | Initial load: fetchTasks + GET /api/v1/habits → populate state → render |
| `render()` | Rebuild all UI from current state (calls sub-renders) |
| `renderDateNav()` | Update date header + prev/next button states |
| `renderTaskList()` | Render task rows into `#todayList` |
| `renderHabitPins()` | Render pinned habit rows (below tasks) |
| `renderStatsPanel()` | Rebuild `#todayStatsPanel` (desktop right column) |
| `toggleTask(id)` | Optimistic toggle → PATCH → patch state → render |
| `addTask(text)` | Create task → POST → push to state → render |
| `deleteTask(id)` | DELETE → filter state → render |
| `renameTask(id, text)` | PATCH text → patch state → render |
| `togglePin(id)` | Toggle habit pin in localStorage → render |
| `silentRefresh()` | Re-fetch tasks if `!_busy` and >3 s since last refresh |

---

## Mutation Pattern (matches habits.js exactly)

### toggleTask

```js
async function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (!t) return;

    // 1. Optimistic visual
    const prev = t.done;
    t.done = !prev;
    render();

    // 2. Server call
    _busy = true;
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { done: t.done });
        // 3. Patch in-memory state with server response
        t.done = updated.done;
        render();
    } catch (err) {
        // 5. Revert + toast
        t.done = prev;
        render();
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _busy = false;
    }
}
```

### addTask / deleteTask follow the same structure: await → patch array → render.

---

## Cross-Device Sync

`silentRefresh` re-fetches tasks on `window focus` and `visibilitychange` (tab becomes visible). It is skipped if `_busy` is true (mutation in-flight) or if fewer than 3 seconds have passed since the last refresh.

```js
function silentRefresh() {
    const now = Date.now();
    if (_busy || now - _lastRefresh < 3000) return;
    _lastRefresh = now;
    (async () => {
        try {
            const fresh = await fetchTasks(viewDay, viewDay === TODAY);
            if (!_busy && JSON.stringify(fresh) !== JSON.stringify(taskItems)) {
                taskItems = fresh;
                render();
            }
        } catch { /* silent */ }
    })();
}
window.addEventListener('focus', silentRefresh);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) silentRefresh();
});
```

---

## Task Row UI

Each task row is built with `document.createElement` (not innerHTML with onclick) so that click listeners survive `render()` rebuilds cleanly. Pattern mirrors `buildRegularRow` in `habits.js`.

```
[ checkbox ]  [ task text ]  [ ✕ delete btn ]
```

- Checkbox click → `toggleTask(id)`
- ✕ click → `deleteTask(id)` (no confirmation, ephemeral tasks)
- Swipe left on mobile → reveal delete (same swipe pattern as habits)
- "Add task" row: `<input>` + Enter → `addTask(text)`

Carried-forward tasks (from past days) show a faint `↑ carried from Mon` label.

---

## Day Navigation

Prev/Next buttons change `viewDay` and re-fetch tasks. Next is disabled when `viewDay === TODAY` (can't navigate to future). Stats panel is hidden when not on today's date.

---

## Pinned Habits

Pinned habit IDs stored in `localStorage` under `hl-pinned-habits`. Each pinned row shows the habit icon + name + a toggle button (same as regular habit row check). Toggling a pinned habit calls the completions API and patches `allHabits` in memory — identical to `habits.js` toggle.

---

## Stats Panel (desktop right column)

On today's view, the right column shows:
- Progress bar (tasks done / total)
- Pinned habit streaks
- Weekly task completion bar chart (7 bars, one per day)

Stats panel is hidden when navigating to a past day (view-only mode for past tasks).

---

## Migration

`migrateLocalTasks()` remains — it was working correctly in the previous fix. The migration guard key (`hl-tasks-migrated-v1`) ensures it runs once.

---

## Files Changed

| File | Change |
|---|---|
| `beaverhabits/static/js/today.js` | Full rewrite |
| `beaverhabits/templates/today.html` | No change (clean shell) |
| `beaverhabits/routes/api.py` | No change (task API is solid) |
| `beaverhabits/storage/dict.py` | No change (task storage is solid) |

---

## Testing

- All 25 existing `tests/test_tasks_api.py` tests must still pass.
- Manual smoke test: add task → toggle → appears done; switch to phone → focus tab → task shows as done (silentRefresh).
- Navigate to yesterday → tasks for that day appear, no add input shown.
- Pin a habit → toggle → stays toggled across page refresh.
