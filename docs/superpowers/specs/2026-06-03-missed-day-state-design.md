# Missed-Day State — Design

**Date:** 2026-06-03
**Status:** Approved (design), pending spec review

## Problem

A day in a habit's history can currently be in only two states:

- **Done** — green circle with ✓
- **Blank** — empty circle

A blank day is ambiguous: it could mean "I deliberately missed this" or "I just haven't touched it." There is no way to *explicitly* record "I did NOT do this on this day."

## Goal

Add a third, explicit **missed** state, visually distinct (red ✕), that the user can set from both the monthly detail calendar and the Today tab. A missed day is **stats-equivalent to a blank day** — the ✕ is purely a deliberate visual note to the user; it does not change any computed metric.

## Day States

| State | Stored as | Rendered |
|---|---|---|
| Done | `count >= target`, `done: true`, `missed: false` | Green circle + ✓ |
| Missed | `count: 0`, `done: false`, `missed: true` | Circle with red ✕ + faint red border |
| Blank | `count: 0`, `done: false`, `missed: false` | Empty circle (unchanged) |

## Data Model

Add a single boolean field, `missed`, to each day's record.

**`habitlab/storage/dict.py` — `DictRecord`:**
- Add `missed` getter → `self.data.get("missed", False)`.
- Add `missed` setter → `self.data["missed"] = bool(value)`.

**`habitlab/storage/dict.py` — `DictHabit.tick()`:**
- Add parameter `missed: bool | None = None`.
- Resolve the final state with this invariant: **if the day ends up `done` or `count > 0`, force `missed = False`.** This guarantees completing a day (by any path, including a normal left-click) always clears a stale ✕.
- Resolution rules:
  - `missed is True` → set `count = 0`, `done = False`, `missed = True`.
  - `missed is False` (explicit) → clear the flag: `missed = False` (with `count`/`done` resolved by the existing `done`/`count` params; for the "Clear" action both are absent → `count = 0`, `done = False`).
  - `missed is None` → leave existing `missed` as-is, then apply the force-false invariant if the resolved day is done / count > 0.
- Persist `missed` into the record `data` for both the update-in-place and new-record branches.

## API

**`habitlab/routes/api.py` — `Tick` model:**
- Add optional field `missed: bool | None = None`.
- Pass `missed=tick.missed` through to `habit.tick(...)` in the non-sub-goal branch.

**`GET /habits` serialization:**
- Include `"missed": r.missed` in each record dict (alongside `done`, `count`, `sub_goals_done`).

**Stats endpoint (`_compute_habit_stats`):** **No change.** A missed day has `count: 0`, so it is already excluded from `done_dates` and sits in the denominator exactly like a blank day. This satisfies "act the same as a missed day."

### Action → request mapping

The three menu items each POST to `/api/v1/habits/{id}/completions`:

| Action | Body |
|---|---|
| Completed | `{ done: true, date, date_fmt }` |
| Not completed | `{ missed: true, date, date_fmt }` |
| Clear | `{ missed: false, done: false, date, date_fmt }` |

## Shared Menu

The menu content is identical in both surfaces, so it lives in one small new module rather than being duplicated.

**New file `habitlab/static/js/daymenu.js`:**
- Exports `openDayMenu(x, y, { onComplete, onMissed, onClear })`.
- Builds/reuses a singleton `.ctx-menu` appended to `<body>` (same CSS class already used by `habits.js` and `notes-page.js` — no new CSS).
- Three items: **Completed** (green ✓), **Not completed** (red ✕), **Clear** (muted ○).
- Positions at `(x, y)`, clamped to the viewport.
- Closes on outside click and Escape (matching existing context menus).
- Invokes the matching callback then closes.

## Trigger Points

### Monthly calendar — `habitlab/static/js/monthly.js`

- `recordsByDay` entries carry `missed`.
- Add a `contextmenu` listener on each **non-future** cell → `openDayMenu(...)` with callbacks that POST the corresponding body, then update `recordsByDay`, repaint the cell, and dispatch `cal:toggled` (detail now includes `missed`).
- `paintCalCircle`: when `missed && !done && count < target`, render the red ✕ (and faint red border) instead of the empty circle. Future cells still never render any state (existing guard retained).

### Today tab — `habitlab/static/js/today.js`

- Habit rows (`.tl-habit-row`) currently have only a `click` handler (→ complete toggle) and a separate drag handle. Left-click behavior is unchanged.
- Add menu trigger, enabled only when `viewDay <= TODAY` (no future marking, matching the calendar's future guard):
  - **Desktop:** `contextmenu` on the row → `openDayMenu(...)`.
  - **Touch:** long-press (~500 ms) on the row → `openDayMenu(...)`. The press timer is **cancelled** if the finger moves beyond a small threshold (scroll) or a SortableJS drag begins, so it never conflicts with reorder or page scroll.
- Callbacks POST the corresponding body, update the in-memory `allHabits` record for `viewDay`, and re-render.
- Circle rendering (`.tl-habit-circle`): add a third case — when the `viewDay` record is `missed && !done`, show the red ✕ instead of the habit icon.

## Scope

**In scope:** monthly detail calendar (`monthly.js`) and Today tab habit rows (`today.js`).

**Out of scope** (these treat a missed day as blank, which is correct since no number changes): yearly heatmap (`heatmap.js`), Today weekly-trend chart, create-habit mini calendar (`calendar.js`).

## Error Handling

Failed POST → `toast(err.message)`. Local state (cell paint / in-memory record) is only updated on success, so there is no stuck optimistic state. Mirrors the existing click handlers.

## Visual Treatment

Confirmed via mockup: missed = normal-background circle with a **red ✕** (`var(--danger)`) and a faint red border. Distinct from solid-green *done* and plain *blank*. Menu wording: **Completed / Not completed / Clear**.

## Testing

- `tick(missed=True)` sets `count=0, done=False, missed=True`; serialization round-trips `missed`.
- `tick(done=True)` after a missed day clears `missed`.
- `tick(missed=False)` (Clear) yields blank.
- Stats output is identical for a missed day vs. a blank day.
- Manual: right-click calendar day and Today row through all three actions; verify ✕ renders, persists across reload, and disappears on Complete/Clear; verify future days offer no menu; verify long-press doesn't fire on scroll/drag.
