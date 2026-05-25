# Bug Log

---

## BUG-001 — Monthly calendar toggles don't update stat cards in place

**Status:** Open  
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

### Next investigation steps

1. **Open browser DevTools console** while clicking a calendar date and check for:
   - Any JS errors thrown
   - Whether `cal:toggled` event is actually firing (`document.addEventListener('cal:toggled', e => console.log(e.detail))`)
   - Whether `refreshDetailStats` is being called and what the API returns
2. **Check if `monthly.js` is actually being re-fetched** — in DevTools Network tab, filter for `monthly.js` and check response headers for `Cache-Control`. The file may need a version query string added to the static import in `habits.js`.
3. **Potential fix for cache issue** — change the import in `habits.js` from:
   ```javascript
   import { mountCalendar, updateCalendarRecord } from '/static/js/monthly.js';
   ```
   to something with cache-busting, or serve JS files with `Cache-Control: no-cache` headers.
4. **Alternative approach** — skip the `monthly.js` event entirely. After any calendar date click, have `habits.js` detect the change by polling or using a `MutationObserver` on `#calContainer`. Less elegant but bypasses the module caching problem.
5. **Simplest nuclear option** — after a successful completion POST, call `refreshHabits()` (full re-fetch of all habits). Slower (~200–400ms extra) but guaranteed to keep everything in sync. Could gate it with a debounce so rapid clicks don't spam the server.

### Files involved

- `beaverhabits/static/js/monthly.js` — `onCalCircleClick`, `toggleSubgoal`
- `beaverhabits/static/js/habits.js` — `cal:toggled` event listener, `refreshDetailStats`
