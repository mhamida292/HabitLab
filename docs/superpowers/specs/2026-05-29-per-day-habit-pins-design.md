# Per-Day Habit Pins — Design

**Date:** 2026-05-29
**Status:** Approved (design)

## Problem

The Today tab pins habits via a single global list, `today_pinned`, stored on
the habit list. The Today view renders those habits for whatever day is being
viewed. Habit *completions* are already per-day (records keyed by date), but pin
*membership* is global — so a pinned habit appears on every day (yesterday,
today, tomorrow, …).

This breaks habits that aren't daily. Example: the user journals ~3×/week.
Pinning "Journal" makes it show on every day, not just the days they plan to do
it. They want a clean split:

- **Default habits** — part of the daily routine, shown every day (Salah,
  Daily Quran, Walk/Workout, Abstain, No Binge, Don't Overeat).
- **Ad-hoc habits** — pinned to a *specific day only* (Journal, etc.), without
  bleeding onto other days.

## Chosen Approach (Option A — two toggles per row)

Keep the single flat "Pin habits" list. Add a second affordance so each row
carries two controls:

- **★ star** → "show every day" (membership in defaults).
- **checkbox** → "pin to just the day I'm viewing" (per-day membership).

Rejected alternatives:
- **B (single context-aware checkbox + separate defaults manager):** hides
  defaults behind a separate screen; awkward first-time setup.
- **C (read-only default chips + "add for this day" picker):** clearest visual
  split but more UI to build (picker dropdown + separate default-edit flow) for
  the same underlying behavior.

All three solve the problem identically underneath — the real fix is *per-day
pins instead of one global list*. A is closest to the current UI and requires
the least new surface area.

## Data Model

Stored on the habit list (the JSON blob in `DictHabitList`):

```
default_pins: list[str]            # ★ habits, shown every day. Order matters.
day_pins:     dict[str, list[str]] # ad-hoc pins keyed by ISO date.
                                   # e.g. {"2026-06-03": ["journal-id"]}
```

- `default_pins` **replaces** the existing `today_pinned` field. On first read,
  if `default_pins` is absent but `today_pinned` exists, migrate the value over
  (see Migration). Order is preserved (drag-reorder target).
- `day_pins` maps an ISO date string to an ordered list of habit IDs pinned to
  that day only. Missing key = no ad-hoc pins that day.

### Effective pinned set for a day

```
effective(day) = default_pins ++ [id in day_pins[day] if id not in default_pins]
```

Defaults first (in their saved order), then that day's extras (in add order),
with extras that are also defaults removed (dedupe — defaults win).

Defaults appear on **all days, past and future** (confirmed). No per-default
start date.

## Storage Layer (`habitlab/storage/`)

`storage.py` (abstract `HabitList`):
- Replace the `today_pinned` property/setter with `default_pins` (same shape,
  `list[str]`).
- Add `day_pins` accessor plus helpers:
  - `get_day_pins(day: str) -> list[str]`
  - `set_day_pins(day: str, ids: list[str]) -> None`

`dict.py` (`DictHabitList`):
- `default_pins` property reads `data["default_pins"]`, falling back to (and
  migrating from) `data["today_pinned"]` if present — see Migration.
- `day_pins` property reads/writes `data["day_pins"]` (a dict). `get_day_pins`
  returns a copy of the list for a date (empty list if absent). `set_day_pins`
  writes the list; if the list is empty, delete the key to keep the blob tidy.

## API Layer (`habitlab/routes/api.py`)

`HabitListMeta` model gains fields:

```python
class HabitListMeta(BaseModel):
    order: list[str] | None = None
    default_pins: list[str] | None = None      # renamed from pinned_today_ids
    day_pins_date: str | None = None           # ISO date for a day-pin write
    day_pins_ids: list[str] | None = None      # ids pinned to that date
```

- `GET /habits/meta` returns `order`, `default_pins`, and — when the client
  passes `?day=YYYY-MM-DD` — `day_pins_ids` for that date. Keeps responses
  small; the client only ever needs the currently-viewed day's extras.
- `PUT /habits/meta`:
  - `default_pins` (when present) → `habit_list.default_pins`.
  - `day_pins_date` + `day_pins_ids` together → `habit_list.set_day_pins(date, ids)`.
    A day-pin write targets one date so we never ship the whole map per toggle.
  - `order` unchanged.

**Backward-compat note:** the field rename `pinned_today_ids → default_pins` is
an internal API used only by this app's own frontend, shipped together. No
external consumers; no aliasing required. (If desired, accept
`pinned_today_ids` as an alias on PUT for one release — optional, not required.)

## Frontend (`habitlab/static/js/today.js`)

State:
- Replace `pinnedIds` with two variables:
  - `defaultPins` (array, ordered) — from `default_pins`.
  - `dayPins` (array, ordered) — extras for `viewDay` only.
- Add `effectivePins()` helper returning the deduped combined list (defaults
  first, then extras) as habit objects — replaces the
  `pinnedIds.map(...).filter(Boolean)` pattern in `computeStats`,
  `renderHabitPins`, and `renderStatsPanel`.

Loading:
- `loadAll()` fetches `/habits/meta?day=${viewDay}`; sets `defaultPins` and
  `dayPins`. Re-fetched on day navigation so `dayPins` matches the viewed day.

`renderPinControl()` — each habit row gets:
- a **★ star** toggle: filled/green when `defaultPins.includes(h.id)`, faint
  outline otherwise. Click → `toggleDefault(h.id)`.
- a **checkbox**: checked when `dayPins.includes(h.id)`; **disabled and shown as
  "—"** when the habit is a default (already on every day). Click →
  `toggleDayPin(h.id)`.
- Both controls disabled when `viewDay < TODAY` (past days read-only), matching
  the existing add-task behavior.

Toggles:
- `toggleDefault(id)` — add/remove in `defaultPins`, re-render, persist via
  `PUT /habits/meta { default_pins }`.
- `toggleDayPin(id)` — add/remove in `dayPins`, re-render, persist via
  `PUT /habits/meta { day_pins_date: viewDay, day_pins_ids: dayPins }`.

Drag-reorder (`initSortables` onEnd):
- Read the new visible order from the DOM, then split into the default subset
  and the extra subset (by membership), preserving relative order within each.
- Persist defaults via `{ default_pins }` and extras via
  `{ day_pins_date: viewDay, day_pins_ids }`. (Dragging an extra above a default
  still stores it as an extra; defaults always render first on reload. Document
  this so the slight reflow-on-reload isn't a surprise.)

Star visual: small, subtle, left of or after the checkbox so it doesn't compete
with the existing completion circle in the main list. Use existing tokens
(`var(--accent)` on, `var(--border)` off).

## Migration

On first read after deploy, `default_pins` is absent. The `default_pins` getter
returns `data["today_pinned"]` if present (and writes it through to
`default_pins` on next save). Result: the user's six currently-pinned habits
become defaults automatically — they keep showing every day, exactly as before.
No user action, no data loss. `today_pinned` may be left in the blob harmlessly
or removed on the migrating write.

## Edge Cases

- **Habit deleted/archived** while pinned: `effectivePins()` already filters by
  `allHabits.find(...)` — stale IDs in either list are ignored at render. A
  cleanup pass on habit delete is optional (not required for correctness).
- **Starring a habit that's also a day-pin:** dedupe drops the day-pin copy;
  star wins. The day-pin id may remain in `day_pins[day]` harmlessly (filtered
  by dedupe). Optionally prune on star.
- **Unstarring a default:** it disappears from days where it isn't a day-pin.
  Expected.
- **Stats panel** renders for `TODAY` only (unchanged) and uses
  `effectivePins()` for today.
- **Empty states:** if `effectivePins(viewDay)` is empty, the pins area renders
  nothing (existing early return).

## Testing

- **Storage:** `default_pins` migrates from `today_pinned`; `get/set_day_pins`
  round-trip; empty list deletes the date key; `day_pins` isolated per date.
- **API:** PUT `default_pins` persists; PUT `day_pins_date`+`day_pins_ids`
  updates only that date; GET `?day=` returns the right extras; migration path
  returns legacy pins as `default_pins`.
- **Frontend (manual):** star Journal off + check it on Wed only → appears Wed,
  absent Thu; defaults appear on a past day; checkbox disabled for starred
  habits; past-day controls read-only; drag-reorder persists across reload.

## Out of Scope (YAGNI)

- Per-default start dates / "from today forward" reach.
- A separate defaults-manager screen.
- Recurring schedules (e.g. "every Mon/Wed/Fri") — this design is manual
  per-day pinning only. Could be a future enhancement layered on `day_pins`.
