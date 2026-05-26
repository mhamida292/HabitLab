# Bug Log

---

## BUG-001 — Monthly calendar toggles don't update stat cards in place

**Status:** Fixed — 2026-05-25  
**Reported:** 2026-05-25  
**Severity:** Medium — data saves correctly, UI is just stale until re-select  

### Symptom

When a user clicks a date circle in the monthly calendar inside the detail panel, the circle updates immediately (optimistic paint) and the completion IS saved to the backend. However the four stat cards (Monthly check-ins, Monthly rate, Current streak, Total check-ins) do not update until the user navigates away from the habit and re-selects it, at which point correct values appear.

### Root confirmed

Data persistence is not the issue. Confirmed by user: "when I undid everything, and clicked back and came back, it all came back."

### What was tried

**Attempt 1 — `onToggle` callback parameter on `mountCalendar`**  
Added an optional 5th argument to `mountCalendar(habitId, subGoals, target, records, onToggle)`. Stored `onToggle` in `calState`. After successful API call in `onCalCircleClick`, called `calState.onToggle?.(iso)`. Wired from `habits.js` with `() => refreshDetailStats(h.id)`.  
**Result:** Did not work. Likely cause: `monthly.js` is imported without a version query string (`import ... from '/static/js/monthly.js'`), so browsers cached the old version of the module that had no `onToggle` support. The new `habits.js` (served with `?v=...`) called `mountCalendar` with the callback, but the cached `monthly.js` silently ignored it.

**Attempt 2 — Custom DOM event (`cal:toggled`)**  
Kept the `onToggle` callback but also added `document.dispatchEvent(new CustomEvent('cal:toggled', { detail: { habitId, iso, newRec, prevDone } }))` in both `onCalCircleClick` and `toggleSubgoal` in `monthly.js`. Added a `document.addEventListener('cal:toggled', ...)` handler in `habits.js` that:
- Updates `allHabits` in-memory records immediately
- Calls `renderHabitList()` to refresh the habit row in the left panel
- Optimistically increments/decrements `statMonthlyCheckins` in the DOM
- Calls `refreshDetailStats(habitId)` async for accurate streak/rate/totals
- Re-renders `renderSubGoalsSection` if the toggled date is today

**Result:** Still not working per user report. Root cause unknown — not yet debugged with browser console open.

### Root cause (confirmed by code analysis)

Two compounding issues:

1. **`index.html` loaded `monthly.js?v=TIMESTAMP`** via a standalone `<script type="module">` tag. But `habits.js` imports `'/static/js/monthly.js'` (no version string). The browser module registry is URL-keyed — these are **two separate module instances**. The versioned script tag's fresh load was never used by `habits.js`.

2. **HTTP cache served stale `monthly.js`** for the unversioned import URL. Starlette's `StaticFiles` doesn't set `Cache-Control`, so browsers use heuristic caching (≈10% of file age since `Last-Modified`). After editing `monthly.js` and reloading, the browser silently served the cached pre-edit version — the one without `onToggle` or `cal:toggled` support.

Both attempts (Attempt 1 and 2) wrote correct code into `monthly.js`, but the browser kept running the old file.

### Fix applied

1. **Added `Cache-Control: no-cache` middleware** in `main.py` for all `/static/js/*.js` responses. `no-cache` means the browser always revalidates with the server before using a cached version (returns 304 if unchanged — still fast).

2. **Removed the redundant `<script type="module" src="monthly.js?v=...">` tag** from `index.html`. It was useless (no side-effects, different URL from habits.js's import) and created a phantom second instance.

Both `onToggle` callback and `cal:toggled` event dispatch were already correctly wired — they simply needed the browser to run the current version of `monthly.js`.

### Files involved

- `beaverhabits/static/js/monthly.js` — `onCalCircleClick`, `toggleSubgoal`
- `beaverhabits/static/js/habits.js` — `cal:toggled` event listener, `refreshDetailStats`

---

## BUG-002 — Timezone mismatch causes wrong all-time % and sub-goals not ticking

**Status:** Fixed — 2026-05-25  
**Reported:** 2026-05-25  
**Severity:** High — incorrect stats and broken UI for all users in UTC+ timezones  

### Symptoms

1. A habit started today and completed today shows **50% all-time %** instead of 100%.
2. Sub-goal check-boxes in the detail panel show as **unchecked** even after ticking them (e.g. Fajr + Dhuhr done for Salah, panel shows all empty).

### Root cause

Every date comparison in the JS used `new Date().toISOString().slice(0, 10)` or `new Date(y, m, d).toISOString().slice(0, 10)`. `toISOString()` converts to UTC before formatting. For a user in UTC+1 at 11 pm local time, `toISOString()` returns the next calendar day.

**Symptom 1 (50%):** The stats endpoint used `datetime.date.today()` server-side — also UTC. Client is in UTC+1 at 11 pm; server thinks it's tomorrow. `days_since_start = (tomorrow − today).days + 1 = 2`. One completion / 2 days = 50%.

**Symptom 2 (sub-goals unchecked):** `renderSubGoalsSection` looked up today's record with `new Date().toISOString().slice(0, 10)` — UTC, which is tomorrow's date. The record is stored under today's local date. No match → `sub_goals_done` empty → all boxes unchecked.

Same root cause appeared in:
- `habits.js`: `isoToday()`, `isoNDaysAgo()`, `renderSubGoalsSection`, `computeWeeklyTrend`, monthly-stat optimistic update, today-check in `cal:toggled` handler
- `monthly.js`: calendar cell ISO generation, monthly trend chart

### Fix applied

**`habits.js` and `monthly.js`:** Added a `localIso(d = new Date())` helper that reads `getFullYear() / getMonth() / getDate()` (local-clock values) and formats as `YYYY-MM-DD`. Replaced every `toISOString().slice(0, 10)` call with `localIso()`.

**`routes/api.py`:** `GET /habits/{id}/stats` now accepts an optional `?today=YYYY-MM-DD` query parameter. When provided, the server uses the client's local date for all calculations (effective start, streak cursor, monthly window). Falls back to `datetime.date.today()` only when the param is absent. All three stats fetch calls in `habits.js` pass `?today=${localIso()}`.

### Files involved

- `beaverhabits/static/js/habits.js` — `localIso()`, `isoToday()`, `isoNDaysAgo()`, `renderSubGoalsSection`, `computeWeeklyTrend`, `refreshDetailStats`, `selectHabit`, `refreshHabits`
- `beaverhabits/static/js/monthly.js` — `localIso()`, calendar cell loop, monthly trend chart loop
- `beaverhabits/routes/api.py` — `get_habit_stats`, added `today` query param
