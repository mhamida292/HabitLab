# Today Tab Polish — Design Spec

**Date:** 2026-05-25
**Branch:** feature/today-tab
**Status:** Approved, ready for implementation

---

## Overview

Four targeted improvements to the Today tab plus one new interaction pattern on the Habits page. All changes are additive or CSS-only except the swipe mechanic and stats panel.

---

## Change 1 — Layout: full-width + two-column desktop

**Problem:** `.today-inner` has `max-width: 560px; margin: 0 auto` which leaves awkward dead space on wide monitors. Even after removing the cap, a single-column task list looks sparse at 1400px+ with the "habit" badge floating on the far right edge.

**Solution:** Two-column layout on desktop. Left column: task list (~340px fixed). Right column: stats panel (flex: 1). On mobile: single column, stats panel hidden.

### Left column (list)
- Identical to current Today tab content
- Fixed width: `340px` on desktop, `100%` on mobile
- Badge sits **inline next to the name** — no `flex: 1` spacer pushing it to the far right

### Right column (stats panel)
Self-contained. Easy to remove entirely if it feels like noise. Three sections:

1. **Today's progress** — 3 stat cards: Done count, Remaining count, % complete. Derived from `allHabits` + `taskItems` already in local state — no API call needed.
2. **Habit streaks** — for each pinned habit: icon + name + current streak (🔥 N days). Uses `api.get('/api/v1/habits/{id}/stats?today=localIso()')` loaded once on init, cached locally.
3. **This week chart** — 7 bars (Mon–Sun), each bar height = % of pinned habits done that day. Derived from `habit.records` already fetched — no extra API call.

### CSS change already applied
`.today-inner { max-width: 560px; margin: 0 auto; }` → `{ width: 100%; }` ✅ done.

---

## Change 2 — Task deletion

**Problem:** One-off tasks can be added but never removed.

### Mobile (touch devices — `@media (hover: none)`)
Swipe row left → red trash button (Lucide `trash-2` SVG, white stroke) slides in from the right. 

- Snap threshold: 40px — snap open if swiped past, snap back if not
- Open width: 56px (icon-only button, no label)
- Tap trash button → task removed from `taskItems`, `saveTasks()` called, row fades out
- Tap anywhere outside open row → row snaps closed
- Implemented with `touchstart` / `touchmove` / `touchend` pointer events

### Desktop (`@media (hover: hover)`)
Hover task row → subtle red ✕ button fades in on the far right (`opacity: 0` → `0.5` on hover, `1` on direct hover of button).

- Click ✕ → task removed immediately, no confirmation (tasks are ephemeral)
- Habit rows in the Today tab get **no** delete affordance (they can be unpinned, not deleted)

---

## Change 3 — Habit icons in Today tab

**Problem:** `makeHabitRow()` and `makePinSection()` in `today.js` ignore `h.icon`, rendering habit name only.

**Fix:** Before inserting the icon span, check `isEmoji(h.icon)`:
- If emoji (or empty): render `<span class="today-row-icon">${h.icon || ''}</span>` as a text node
- If Lucide name: use `buildIconEl(h.icon, 16)` — requires importing `buildIconEl` and `isEmoji` from `icons.js`

Apply to both `makeHabitRow()` and the pin list rows in `makePinSection()`.

---

## Change 4 — Habits page: swipe to archive / delete (mobile)

**Problem:** No quick way to archive or delete a habit on mobile without navigating into the detail panel.

### Mobile (touch devices)
Swipe habit row left → two icon-only buttons reveal (128px total):
- **Archive** (amber `#b45309` background, Lucide `archive` SVG) — calls `PUT /api/v1/habits/{id}` with `{ status: "archive" }`. Habit disappears from list immediately. No confirmation needed (reversible).
- **Delete** (red `#b91c1c` background, Lucide `trash-2` SVG) — shows a small inline confirmation: row expands to show "Delete permanently?" with Yes/No. Calls `DELETE /api/v1/habits/{id}` on confirm.

Same snap mechanic as task rows (threshold 40px, snap animation 200ms cubic-bezier).

### Desktop (pointer devices)
Right-click habit row → custom context menu positioned at cursor:
- **Edit** (accent colour) — opens existing habit edit modal (same as clicking the ··· button today)
- **Archive** (amber) — same API call as mobile
- **Delete…** (red, "…" signals confirmation) — same confirmation flow as mobile
- Dismissed by clicking anywhere outside, or pressing Escape
- Implemented via `contextmenu` event; `e.preventDefault()` to suppress native menu

### Shared behaviour
- Archive uses existing `PUT /api/v1/habits/{id}` with `{ status: "archive" }` — already supported
- Delete uses existing `DELETE /api/v1/habits/{id}` — already supported
- No new API endpoints needed

---

## File Map

| File | Change |
|------|--------|
| `beaverhabits/static/css/styles.css` | Two-column today layout; swipe row styles; hover ✕ styles; context menu styles |
| `beaverhabits/static/js/today.js` | Import `buildIconEl`, `isEmoji`; fix `makeHabitRow`, `makePinSection`; add swipe logic for tasks; add two-column render; stats panel |
| `beaverhabits/static/js/habits.js` | Add swipe logic for habit rows; add right-click context menu |
| `beaverhabits/templates/today.html` | Add `#todayStatsPanel` column div |

---

## Out of Scope

- Due dates on tasks (explicitly excluded)
- Editing task text after creation (can be revisited later)
- Archived habits management page (separate feature)
- Notes or detail panel changes (separate plan: `2026-05-25-detail-panel-and-notes.md`)

---

## Success Criteria

1. Today tab at 1400px wide looks natural — list is left-anchored, no floating badges
2. Stats panel renders correct data and is visually self-contained (easy to delete)
3. Swiping a task left on mobile reveals trash icon; tapping it removes the task
4. Hovering a task on desktop reveals ✕ button; clicking it removes the task
5. Habit icons/emojis appear in every habit row in the Today tab and pin section
6. Swiping a habit on the habits page reveals archive + delete buttons
7. Right-clicking a habit on desktop shows the context menu at cursor
8. Delete always asks for confirmation; archive is immediate
9. All existing Today tab functionality (carry-forward, sub-goals, day nav, progress bar) still works
