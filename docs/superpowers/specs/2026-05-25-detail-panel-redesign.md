# Detail Panel Redesign — Design Spec
**Date:** 2026-05-25  
**Status:** Approved

---

## Problem

The habit detail panel wastes the majority of its horizontal space. Content (stat cards + monthly calendar) is pinned to the left edge with a hard `max-width: 360px` on the calendar, leaving a large empty grey void to the right and below. On a typical desktop screen, more than half the panel is unused.

---

## Solution Overview

Restructure the detail panel into a **two-column layout** that fills the full width, and enrich the right column with three new content sections. The mobile view collapses to a single scrollable column.

---

## Layout — Desktop (≥ 768px)

Two equal-width flex columns separated by a subtle vertical rule.

### Left Column
1. **Stat grid (2×2)** — four cards: Monthly check-ins, Total check-ins, Monthly rate, Current streak. The two completion cards (Monthly completion, Total completion) are dropped — they are redundant with check-in counts.
2. **Inset calendar** — the monthly check-in calendar, full column width. Framed as a sunken well (slightly darker background, no border, no shadow). Nav buttons (‹ ›) sit inside the calendar header. The `max-width: 360px` constraint on `.cal-section` is removed.

### Right Column
Sections stack top-to-bottom in this order:

1. **Sub-goals · today** *(conditional — hidden entirely for habits without sub-goals)*  
   - Checklist of today's sub-goals, each with a checkbox and name  
   - Thin progress bar at the bottom showing today's completion ratio  
   - Tapping a sub-goal opens the existing sub-goal popup  

2. **Weekly trend chart**  
   - 8-week bar chart of check-in rate (check-ins / days elapsed in week × 100%)  
   - Computed client-side from the records array already passed to `mountCalendar` — no new backend endpoint  
   - Current week highlighted in a darker blue  
   - Week labels: W1 … W7, "now"  

3. **Recent notes**  
   - Last 2 records where `record.text` is non-empty, sorted newest-first  
   - Notes are stored as `text` on completion records — no separate API call needed; filtered client-side from the records already on the habit object  
   - Each note shows the date + body text; clicking opens `openNoteEditor({ habitId, date, existing, onSave })` for that date  
   - "+ Add note" button opens `openNoteEditor` for today's date  
   - If the habit has no notes yet, shows only the "+ Add note" prompt  

---

## Layout — Mobile (< 768px)

Single scrollable column. Existing behaviour (detail panel slides in full-screen) is unchanged. Content stacks in this order:

1. Stats (2×2 grid, full width)
2. Inset calendar (full width)
3. Sub-goals card *(hidden if none)*
4. Weekly trend chart card
5. Recent notes card

Each right-column section becomes a white card (`background: #fff; border: 1px solid var(--border); border-radius: 8px`) instead of a column section with a divider. Section labels remain. Everything scrolls naturally — no fixed heights.

One `@media (max-width: 767px)` breakpoint handles the switch.

---

## Component Changes

### `beaverhabits/templates/index.html`
- Replace the flat `#detailContent` structure with a two-column flex container
- Left column: `#detailLeft` — stat grid + cal section
- Right column: `#detailRight` — sub-goals section, trend section, notes section
- Add section-level wrapper divs with IDs for JS targeting: `#detailSubGoals`, `#detailTrend`, `#detailNotes`

### `beaverhabits/static/css/styles.css`
- New `.detail-columns` flex container (gap, align-items: flex-start)
- New `.detail-col-left`, `.detail-col-right` (flex: 1, min-width: 0)
- `.detail-col-right` gets `border-left: 1px solid var(--border); padding-left: var(--gap)`
- Remove `max-width: 360px` from `.cal-section`
- New `.cal-inset` frame: `background: var(--bg-elevated); border-radius: 9px; padding: 8px 10px`
- New `.detail-section` block: label + content, `margin-bottom: 16px`
- New `.trend-bars` chart styles (flex, bar, bar.current)
- New `.detail-note-item` (date + text, separator)
- Mobile overrides: stack columns, card-wrap right sections

### `beaverhabits/static/js/habits.js`
- `renderDetail(habit)`: populate both columns
- `renderTrendChart(records)`: compute 8-week buckets from records, render bar chart as inline SVG or CSS flex bars
- `renderRecentNotes(records)`: filter records where `record.text` is non-empty, take last 2 sorted by date descending, render into `#detailNotes`. No API call — data already in hand.
- Sub-goals section: show/hide `#detailSubGoals` based on whether `habit.sub_goals.length > 0`; render today's sub-goals with checkboxes wired to existing sub-goal toggle logic

---

## Data / Backend

No new backend endpoints required.

- **Stats**: existing `/api/v1/habits/{id}/stats`
- **Records**: already included in habit list response (`records` field)
- **Weekly trend**: computed client-side from records
- **Notes**: `record.text` on completion records — already in the habits list response, no additional fetch
- **Sub-goals**: already on the habit object

---

## What Is Not Changing

- The habit list panel (left sidebar) — untouched
- The week strip at the top — untouched
- The note modal, sub-goal popup, settings modal — untouched
- Mobile slide-in behaviour — untouched
- The heatmap page — untouched
- Existing stat IDs `statMonthlyCheckins`, `statTotalCheckins`, `statMonthlyRate`, `statStreak` — kept so JS wiring in `habits.js` continues to work
- **Note:** `statMonthlyCompletion` and `statTotalCompletion` HTML elements are removed; the two corresponding `.textContent` assignments in `habits.js` must be removed at the same time to avoid silent JS errors

---

## Success Criteria

- Desktop: detail panel uses full width, no visible empty grey area
- Calendar renders full-width inside the inset frame, looks contained
- Sub-goals section absent for habits without sub-goals, present and interactive for those that have them
- Weekly trend chart renders from existing records data without a network call
- Recent notes load and the add-note button opens the existing modal
- Mobile: single-column scroll, all sections visible and legible, no horizontal overflow
