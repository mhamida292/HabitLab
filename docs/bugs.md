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
