# Design: Server-Side Task Sync + Swipe Delete Banner Fix

**Date:** 2026-05-26  
**Status:** Approved

---

## Overview

Two independent changes:

1. **Bug fix** — The swipe-to-delete confirmation banner on the Habits page shows amber/red swipe buttons bleeding through behind it. One CSS line fixes this.
2. **Feature** — Today tab tasks are currently stored in `localStorage`, making them device-local. Moving storage to the server syncs tasks across all devices. Optimistic updates + visibility-based refresh keep the UI feeling instant.

---

## 1. Bug Fix: Swipe Delete Banner

### Root Cause

`.hrow-swipe-btns` is positioned absolutely with `top: 0; bottom: 0` inside `.hrow-wrap`. When the delete confirmation banner is `appendChild`-ed into the wrap, the wrap grows taller and the swipe buttons stretch down behind the banner. The `.hrow-delete-confirm` has no stacking context so it renders below the buttons.

### Fix

Add `position: relative; z-index: 2` to `.hrow-delete-confirm` in `styles.css`. The swipe inner row already has `z-index: 1`; the confirmation banner at `z-index: 2` renders on top of the swipe buttons.

**File:** `beaverhabits/static/css/styles.css`  
**Change:** `.hrow-delete-confirm` — add `position: relative; z-index: 2;`

---

## 2. Feature: Server-Side Task Sync

### Architecture

Tasks follow the same storage pattern as Notes: a `tasks` list stored in the per-user JSON blob in `HabitListModel.data`. No new DB table needed.

### Data Shape

Each task:
```json
{
  "id": "abc123",
  "text": "Call dentist",
  "done": false,
  "date": "2026-05-26",
  "carriedFrom": "2026-05-25"   // optional, set on carry-forward
}
```

All tasks live in `habit_list.data["tasks"]` as a flat list. Date filtering and carry-forward happen in the storage layer.

### Storage Layer (`beaverhabits/storage/dict.py`)

New methods on `DictHabitList`:

| Method | Description |
|---|---|
| `get_tasks(date: str) -> list[dict]` | Returns tasks for `date` plus undone tasks from the 7 preceding days (tagged with `carriedFrom`). Carry-forward deduplicates by task `id` so a task isn't carried more than once. |
| `add_task(date: str, text: str) -> dict` | Creates a new task with a UUID `id`, appends to `data["tasks"]`. |
| `update_task(task_id: str, done: bool | None, text: str | None) -> dict | None` | Patches `done` and/or `text` on the matching task. Returns updated task or `None` if not found. |
| `delete_task(task_id: str) -> bool` | Removes task by id. Returns `True` if deleted. |

### API Endpoints (`beaverhabits/routes/api.py`)

All under `/api/v1/tasks`, auth-gated same as all other endpoints.

```
GET    /tasks?date=YYYY-MM-DD    List tasks for date (with carry-forward)
POST   /tasks                    Create task  { text: str, date: str }
PATCH  /tasks/{id}               Update task  { done?: bool, text?: str }
DELETE /tasks/{id}               Delete task
```

Response shapes:
- `GET` → `list[TaskDict]`
- `POST` → `TaskDict`
- `PATCH` → `TaskDict`
- `DELETE` → `{ "ok": true }`

### Frontend (`beaverhabits/static/js/today.js`)

#### What changes

- Remove all `localStorage` task reads/writes (`loadTasks`, `saveTasks`, the `tasksKey()` helper).
- `pinnedIds` stays in `localStorage` (device-local UI preference, intentionally not synced).
- On init: `await loadTasksFromServer(TODAY)` replaces `loadTasks(TODAY)`.
- Task mutations (add, toggle, delete) use **optimistic updates**:
  1. Update `taskItems` in memory and re-render immediately (zero perceived latency).
  2. Fire API call in background.
  3. On error: revert the in-memory change, re-render, show `toast('Failed', 'error')`.

#### Carry-forward

Carry-forward logic moves entirely to the server (`get_tasks` backend method). The frontend just fetches and renders whatever the server returns. The `carryForwardTasks()` function in `today.js` is removed.

#### Visibility-based refresh (cross-device sync)

```js
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') silentRefresh();
});
window.addEventListener('focus', silentRefresh);
```

`silentRefresh()`:
- Fetches `GET /tasks?date=${viewDay}` silently.
- If the returned list differs from `taskItems` (compare by id+done+text), updates `taskItems` and re-renders.
- Does NOT show a loading spinner — the existing list stays visible until the new data arrives.
- Debounced to at most once per 3 seconds to avoid hammering on rapid focus/blur.

#### Loading state

On initial page load, show a subtle skeleton or the existing spinner (same as habits load). Once tasks arrive, render normally. No skeleton needed on `silentRefresh`.

### Error Handling

| Scenario | Behaviour |
|---|---|
| Network error on add | Revert optimistic add, toast error |
| Network error on toggle | Revert optimistic toggle, toast error |
| Network error on delete | Revert optimistic delete, toast error |
| Server 404 on patch/delete | Treat as success (task already gone), no revert |
| `silentRefresh` fails | Swallow silently — stale data is better than an error flash |

### What is NOT changed

- `pinnedIds` stays in `localStorage`.
- The stats panel and habit pins are unchanged.
- No changes to the Habits page or any other tab.

---

## Files Changed

| File | Change |
|---|---|
| `beaverhabits/static/css/styles.css` | Add `position: relative; z-index: 2` to `.hrow-delete-confirm` |
| `beaverhabits/storage/dict.py` | Add `get_tasks`, `add_task`, `update_task`, `delete_task` to `DictHabitList` |
| `beaverhabits/routes/api.py` | Add `GET/POST/PATCH/DELETE /tasks` endpoints |
| `beaverhabits/static/js/today.js` | Replace localStorage task logic with API calls + optimistic updates + visibility refresh |

---

## Out of Scope

- Task reordering (drag-to-reorder).
- Task due dates / reminders.
- Sharing tasks between users.
- Offline queue (service worker).
