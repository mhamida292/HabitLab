# HabitLab — TickTick-Inspired Redesign Spec

**Date:** 2026-05-24  
**Scope:** Full frontend overhaul — all screens  
**Approach:** Keep `api.js` fetch layer and core API logic intact; replace all CSS, HTML templates, and page-specific JS modules

---

## 1. Goals

- Make the app look and feel like TickTick's Habits view (reference screenshot provided)
- Add first-class support for **sub-goals** — named checkpoints within a habit (e.g. Salah → Fajr, Dhuhr, Asr, Maghrib, Isha)
- Replace the rolling-window heatmap with a **monthly calendar view** (TickTick circle style)
- Consistent dark theme across all screens

---

## 2. Design System

### Colours
| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#0d0d11` | App background |
| `--bg-surface` | `#111118` | Cards, panels |
| `--bg-elevated` | `#16161e` | Hover states, rows |
| `--bg-input` | `#1a1a24` | Inputs, cells |
| `--border` | `#1e1e2a` | Dividers |
| `--accent` | `#2563eb` | Primary action, done state |
| `--accent-light` | `#60a5fa` | Labels, links |
| `--text-primary` | `#e0e0e0` | Body text |
| `--text-secondary` | `#666` | Meta text, labels |
| `--text-muted` | `#444` | Disabled, out-of-month |
| `--streak` | `#f97316` | Streak badges |

### Typography
- Font: system-ui / -apple-system / BlinkMacSystemFont / 'Segoe UI'
- Sizes: 10px (meta), 11px (labels/chips), 12–13px (body), 14–17px (titles)
- All uppercase labels: `letter-spacing: 0.07em`

### Radius & Spacing
- Cards / panels: `border-radius: 10–12px`
- Rows / cells: `border-radius: 7–9px`
- Pills: `border-radius: 20px`
- Base spacing unit: 4px

---

## 3. Screen Inventory

| Screen | Route | Status |
|---|---|---|
| Login / Setup | `/login` | Restyled |
| Main Habits List | `/` | Full redesign |
| Habit Detail | `/habits/:id` | Full redesign |
| Heatmap (multi-year) | `/heatmap/:id` | Restyled |
| Settings (modal) | n/a | Restyled |

---

## 4. Navigation Rail

A fixed 52px-wide left column present on all authenticated screens.

**Items (top to bottom):**
1. User avatar (initials, green gradient) — links to settings
2. Habits icon (checklist) — active indicator: blue bg chip
3. Stats icon (waveform) — future stats page
4. Search icon
5. *(spacer)*
6. Settings icon (gear)

Active item: `background: #1e2d4a`, icon `color: #60a5fa`.  
Inactive: `color: #555`, hover `background: #1a1a22`.  
No text labels — icons only.

---

## 5. Main Habits List (`/`)

### Layout
```
┌─ Nav Rail (52px) ─┬──────────── Main Panel ────────────┐
│                   │  Top Bar: "Habit ▾"    [⊞][···][+] │
│  [avatar]         ├────────────────────────────────────┤
│  [habits]  ←      │  Week Strip (Mon–Sun)               │
│  [stats]          ├────────────────────────────────────┤
│  [search]         │  📌 May 24  ✕                       │
│                   │                                    │
│  [settings]       │  ▼ Morning  2                      │
│                   │    [📖] Daily Quran   ···    [ ]   │
│                   │    [🕌] Salah    2/5               │
│                   │         [Fajr✓][Dhuhr✓][Asr][…]   │
│                   │                                    │
│                   │  ▼ Others  3                       │
│                   │    [🧘] Meditate     ···    [✓]    │
│                   │    [🙅] Don't Binge  ···    [ ]    │
└───────────────────┴────────────────────────────────────┘
```

### Week Strip
- 7 columns (Mon → Sun), each showing: day-of-week label, day number, completion dot
- Today: day number has `background: #2563eb`, white text
- Dot states: none (no data), partial (blue 40% opacity), full (solid blue)
- Tapping a past day filters the list to show that day's completion state

### Date Chip
- Shown when a non-today day is selected: `📌 May 24 ✕`
- ✕ clears back to today

### Group Headers
- Habits are grouped by their **first tag**; untagged habits go into "Others"
- Header: `▼ {Tag name}  {count}` — clicking collapses/expands the group
- Groups sorted: tagged groups alphabetically, "Others" always last

### Regular Habit Row
```
[icon 34px] [Name]          [toggle ○]
            [💧 N Days] [🔥 N Day]
```
- Icon: circular 34px, `background: #1a1a24`, emoji centred
- Name: 13px, `color: #e0e0e0`; if done today: `text-decoration: line-through`, `color: #4a4a5a`
- Stats: `💧 N Days` (total completions) · `🔥 N Day` (current streak)
- Toggle: 24px circle, right-aligned. Empty = `border: 2px solid #333340`. Done = `background: #2563eb` with `✓`
- Tapping the row anywhere → navigates to habit detail
- Tapping the toggle → marks done/undone for selected day (optimistic update, rollback on error)

### Sub-Goal Habit Row
```
[ring 34px] [Name]          ← no toggle
            [💧 N Days] [2/5 prayers]
[   Fajr✓  ][  Dhuhr✓  ][   Asr   ][ Maghrib ][ Isha ]
```
- Icon replaced by a **progress ring**: SVG circle, fills proportionally to sub-goals done
- Progress label: `{done} / {total} {unit}` where unit comes from the habit's sub-goal config
- Pills: `border-radius: 20px`, 11px font
  - Pending: `background: #16161e`, `color: #666`, `border: 1px solid #22222e`
  - Done: `background: #1a2d4a`, `color: #60a5fa`, `border: 1px solid #2563eb60`, prefix `✓ `
  - Tapping a pill toggles that sub-goal for the selected day
- No toggle button — completion state is derived (all sub-goals done = habit done)

### Add Button
- Top-right `+ Add` → opens a modal/drawer:
  - Habit name input
  - Emoji icon picker
  - Tags input (comma-separated)
  - Sub-goals toggle: off by default; when on, shows a list of named sub-goal entries
  - Sub-goal "unit label" field (e.g. "prayers", "sets", "chapters")

---

## 6. Habit Detail Page (`/habits/:id`)

### Layout
```
← Back    [🕌  Salah]  Morning · 5 sub-goals        [✎][···]
──────────────────────────────────────────────────────────
│ Streak 🔥5 │ Total 42 │ 30-day 78% │ 90-day 84% │   ← stat cards
──────────────────────────────────────────────────────────
Per-prayer breakdown   (sub-goal habits only)
  Fajr    ████░░░░  62%  🔥8d
  Dhuhr   █████████ 91%  🔥14d
  Asr     ███████░  78%  🔥5d
  Maghrib ████████░ 88%  🔥11d
  Isha    ███████░  71%  🔥5d
──────────────────────────────────────────────────────────
History · May 2026      ‹  ›
  Mon Tue Wed Thu Fri Sat Sun
  [○] [✓] [✓] [⟳] [✓] [✓] [◑]   ← circles
  ...
```

### Stat Cards
Four cards in a row: **Streak**, **Total** (full completion days), **30-day %**, **90-day %**.  
Sources: existing `/api/v1/habits/:id/stats` endpoint — no backend change needed.

### Sub-Goal Breakdown
Only rendered for sub-goal habits. Shows per-sub-goal:
- Name (e.g. "Fajr")
- Horizontal progress bar (30-day completion %)
- Percentage label
- Streak badge

Data computed client-side from the full habit record list (fetched once on page load via `GET /api/v1/habits/:id`).

### Monthly Calendar
- Navigation: `‹ Month Year ›` arrows
- 7-column grid (Mon → Sun), day-of-week headers
- Out-of-month days shown at 25% opacity, non-interactive
- **Day cell states:**
  - Empty (no record): `background: #14141a`, grey
  - Done (count ≥ target): `background: #2563eb`, white `✓`
  - Partial (sub-goal habits, 0 < done < total): conic-gradient ring, `{done}/{total}` label inside
  - Future: same as empty, non-interactive
  - Today: `outline: 2px solid #3b82f6`
- Tapping a cell on the detail page does **not** toggle — read-only view here. (Editing happens via the main list or heatmap page)
- Month summary row below calendar: Month %, Streak, Full days, Missed

---

## 7. Login / Setup Page (`/login`)

Clean centred card on the dark background:
- HabitLab logo mark + wordmark
- Email + password fields (styled to match design system)
- "Sign in" button (`background: #2563eb`)
- Setup mode (first user): shows "Create account" instead
- No sidebar — full-width layout

---

## 8. Settings Modal

Triggered from the gear icon in the nav rail. Rendered as a slide-in drawer (right side):
- Account section: email display, change password, API token management
- Data section: Export JSON, Import JSON
- Danger zone: Delete account
- Styled to match the dark design system; no visual change to settings options themselves

---

## 9. Data Model Changes

### New field on `Habit`: `sub_goals`
```json
{
  "sub_goals": [
    { "id": "fajr",    "name": "Fajr"    },
    { "id": "dhuhr",   "name": "Dhuhr"   },
    { "id": "asr",     "name": "Asr"     },
    { "id": "maghrib", "name": "Maghrib" },
    { "id": "isha",    "name": "Isha"    }
  ],
  "sub_goal_unit": "prayers"
}
```
- `sub_goals`: ordered list of `{id, name}` objects. Empty array = not a sub-goal habit
- `sub_goal_unit`: display label for the progress count (default: "items")
- Stored in the existing `DictHabit` JSON blob — no schema migration required

### Extended completion record: `sub_goals_done`
```json
{
  "day": "2026-05-24",
  "done": false,
  "count": 2,
  "text": "",
  "sub_goals_done": ["fajr", "dhuhr"]
}
```
- `sub_goals_done`: list of sub-goal IDs completed that day
- `done` is derived: `len(sub_goals_done) >= len(sub_goals)` (or `count >= target_count` for non-sub-goal habits)
- `count` mirrors `len(sub_goals_done)` for sub-goal habits

### API Changes
Two new endpoints:

**`PUT /api/v1/habits/:id`** — extended body to accept `sub_goals` and `sub_goal_unit`  
(Existing endpoint; just add fields to the `UpdateHabit` Pydantic model)

**`POST /api/v1/habits/:id/completions`** — extended body:
```json
{
  "date": "24-05-2026",
  "sub_goal_id": "asr",
  "done": true
}
```
When `sub_goal_id` is present, toggle that specific sub-goal rather than the whole habit.  
The endpoint recalculates `count` and `done` after the sub-goal update.

---

## 10. Frontend File Changes

| File | Change |
|---|---|
| `static/css/styles.css` | Full rewrite — new design system |
| `templates/base.html` | New nav rail layout, remove old sidebar slot |
| `templates/index.html` | Rewrite — week strip + grouped list structure |
| `templates/habit_detail.html` | Rewrite — stat cards + breakdown + monthly calendar |
| `templates/heatmap.html` | Restyle only |
| `templates/login.html` | Restyle — centred card |
| `templates/_habit_modal.html` | Rewrite — add sub-goal fields |
| `templates/_settings_modal.html` | Restyle |
| `templates/_note_modal.html` | Restyle |
| `static/js/habits.js` | Full rewrite — new DOM structure |
| `static/js/calendar.js` | Replace with `monthly.js` — circle calendar |
| `static/js/heatmap.js` | Keep `renderSingleHeatmap` logic; update CSS class names only |
| `static/js/app.js` | Keep; minor additions for sub-goal helpers |
| `static/js/api.js` | Keep entirely |
| `static/js/notes.js` | Keep; update selectors to match new modal HTML |

---

## 11. What Is NOT Changing

- All FastAPI routes (`routes/pages.py`, `routes/api.py`, `routes/metrics.py`)
- Auth system (`app/auth.py`, `app/users.py`)
- Storage layer (`storage/dict.py`, `storage/storage.py`)
- Database models (`app/db.py`)
- All existing API endpoints (except the two extensions noted above)
- `api.js` fetch wrapper

---

## 12. Success Criteria

1. Main list matches the TickTick Habits screenshot provided
2. Salah (or any sub-goal habit) shows pill chips; tapping a pill updates that sub-goal only
3. Habit detail shows a monthly circle calendar — navigable by month
4. Sub-goal habits show a per-sub-goal breakdown on the detail page
5. All screens use the unified dark design system
6. All existing habits, completions, and stats continue to work unchanged
7. No regressions on existing API token, import/export, or note features
