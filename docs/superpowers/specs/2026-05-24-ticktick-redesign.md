# HabitLab — TickTick-Inspired Redesign Spec

**Date:** 2026-05-24  
**Scope:** Full frontend overhaul — all screens  
**Approach:** Keep `api.js` fetch layer and core API logic intact; replace all CSS, HTML templates, and page-specific JS modules

---

## 1. Goals

- Make the app look and feel like TickTick's Habits view (reference screenshots provided)
- Add first-class support for **sub-goals** — named checkpoints within a habit (e.g. Salah → Fajr, Dhuhr, Asr, Maghrib, Isha)
- Replace the rolling-window heatmap with a **monthly calendar view** (TickTick circle style)
- **Split-panel layout** — habit list stays visible on the left, detail opens on the right
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
- Uppercase labels: `letter-spacing: 0.07em`

### Radius & Spacing
- Cards / panels: `border-radius: 10–12px`
- Rows / cells: `border-radius: 7–9px`
- Pills: `border-radius: 20px`
- Base spacing unit: 4px

---

## 3. Overall Layout

```
┌─ Nav Rail ─┬──────── List Panel ─────────┬──────── Detail Panel ────────┐
│  (46px)    │  (fixed ~340px)             │  (flex: 1)                   │
│            │                             │                              │
│  [avatar]  │  Top bar: Habit ▾  [⊞][+]  │  [icon] Habit Name    [···]  │
│  [habits]  │  Week strip                 │                              │
│  [stats]   │  📌 May 24  ✕              │  6 stat cards (2×3 grid)     │
│  [search]  │  ▼ Morning  2               │                              │
│            │    Daily Quran     [ ]      │  Monthly calendar            │
│  [settings]│    Salah    2/5             │  (circle cells, Sun–Sat)     │
│            │     [Fajr✓][Dhuhr✓][Asr]  │                              │
│            │  ▼ Others  3                │  Daily Goals line chart      │
│            │    Meditate        [✓]      │                              │
└────────────┴─────────────────────────────┴──────────────────────────────┘
```

**Selected habit** in the list: blue left border + `background: #111c30`.  
**No habit selected**: right panel shows an empty state ("Select a habit to see details").  
**Mobile** (< 768px): panels stack; tapping a habit navigates full-screen to the detail view.

---

## 4. Navigation Rail

Fixed 46px-wide left column present on all authenticated screens.

**Items (top → bottom):**
1. User avatar (initials, green gradient)
2. Habits icon — active state: `background: #1e2d4a`, icon `color: #60a5fa`
3. Stats icon (waveform)
4. Search icon
5. *(spacer)*
6. Settings icon (gear)

Icons only — no text labels.

---

## 5. List Panel

### Top Bar
`Habit ▾` title · `[⊞ layout toggle]` · `[+ add]` · `[··· more]`

### Week Strip
- 7 columns Mon → Sun; today highlighted `background: #2563eb`
- Dot below each day: none / partial (blue 40% opacity) / full (solid blue)
- Tapping a past/future day filters the list to that day's completion state
- Active day shown as chip: `📌 May 24 ✕`

### Habit Grouping
- Habits grouped by **first tag**; untagged → "Others" (always last)
- Group header: `▼ {Tag}  {count}` — click to collapse/expand

### Regular Habit Row
```
[icon 30px]  Name                    [toggle ○]
             💧 N Days  🔥 N Day
```
- Done today: name struck-through, `color: #4a4a5a`; toggle filled blue `✓`
- Tapping the **row** → selects habit, opens detail in right panel
- Tapping the **toggle** → marks done/undone for the active day (optimistic update + rollback)

### Sub-Goal Habit Row
```
[ring 30px]  Name                    (no toggle)
             💧 N Days  · 2/5 prayers
[Fajr ✓] [Dhuhr ✓] [Asr] [Maghrib] [Isha]
```
- Icon replaced by **progress ring** (SVG conic, fills as sub-goals are checked)
- Pills: pending = dark bg + grey text; done = `background: #1a2d4a`, `color: #60a5fa`, prefix `✓`
- Tapping a **pill** → toggles that sub-goal for the active day
- Tapping the **row body** (not a pill) → selects habit, opens detail panel

---

## 6. Detail Panel

Opens when a habit is selected from the list. The list remains visible.

### Header
`[icon]  Habit Name` · `[···]` (edit / archive / delete)

### 6 Stat Cards (2-column grid)
| Card | Value | Source |
|---|---|---|
| Monthly check-ins | N Day | completions this calendar month |
| Total check-ins | N Day | all-time completions |
| Monthly check-in rate | N % | completions / days elapsed this month |
| Current streak | N Day | existing `/stats` endpoint |
| Monthly completion | N Count | sum of `count` this month |
| Total completion | N Count | sum of `count` all-time |

All computable client-side from `GET /api/v1/habits/:id` (returns full record list).

### Monthly Calendar
- Navigation: `‹ Month Year ›`
- **Sunday-first** column order (Sun Mon Tue Wed Thu Fri Sat)
- Out-of-month days: 25% opacity, non-interactive
- Today: `outline: 2px solid #3b82f6`

**Day circle states:**

| State | Visual |
|---|---|
| Empty | `background: #1a1a24`, no content |
| Done (count ≥ target) | `background: #2563eb`, white `✓` |
| Partial (sub-goal habit, 0 < done < total) | Conic-gradient ring, `{done}` label inside |
| Future | Same as empty, non-interactive |

**Tap behaviour:**
- **Regular habits**: tap toggles done ↔ undone (same `stepCell` logic as existing heatmap)
- **Sub-goal habits**: tap opens a **popup picker** anchored to the circle:
  - Shows `{date} · {habit name}` title
  - Lists each sub-goal with individual checkbox
  - Tap a sub-goal → toggles it, updates circle in real-time
  - Closes on outside click
  - On narrow screens: renders as a bottom sheet instead

### Daily Goals Line Chart
- X-axis: days 1–{last day of month}
- Y-axis: 0 → target count
- Plotted line: `count` per day from the full record list
- Dashed target line at `y = target_count`
- Blue fill under the line, `stroke: #2563eb`
- Data already available from `GET /api/v1/habits/:id` — no extra endpoint

---

## 7. Add / Edit Habit Modal

Triggered by `+ Add` button or `···` → Edit on an existing habit.

```
┌─────────────────────────────────┐
│  New Habit              [✕] [Save]│
├─────────────────────────────────┤
│  [🕌]  [_____ Habit name _____] │
│                                  │
│  Tag        [_______________]    │
│                                  │
│  Has sub-goals          [toggle] │
│  ┌─ when toggle is ON ─────────┐ │
│  │ ⠿  Fajr              [✕]   │ │
│  │ ⠿  Dhuhr             [✕]   │ │
│  │ ⠿  Asr               [✕]   │ │
│  │ ⠿  Maghrib           [✕]   │ │
│  │ ⠿  Isha              [✕]   │ │
│  │ ＋ Add sub-goal             │ │
│  │                             │ │
│  │ Unit label  [prayers]       │ │
│  │ Preview: 2 / 5 prayers      │ │
│  └─────────────────────────────┘ │
└─────────────────────────────────┘
```

- **Icon picker**: clicking the icon circle opens an emoji picker overlay
- **Sub-goals**: draggable to reorder (using existing Sortable.js, already vendored)
- **Unit label**: optional free-text field; default "items"; shows live preview `{done} / {total} {unit}`
- **Save**: validates name not empty, sub-goal names not empty if toggle is on

---

## 8. Login / Setup Page (`/login`)

Centred card on the dark background:
- HabitLab logo mark + wordmark
- Email + password fields
- "Sign in" / "Create account" button (`background: #2563eb`)
- No sidebar

---

## 9. Settings

Triggered from the gear icon in the nav rail. Slide-in drawer from the right:
- Account: email display, change password, API token management
- Data: Export JSON, Import JSON
- Danger zone: Delete account
- Styled to match design system; no changes to settings functionality

---

## 10. Data Model Changes

### New fields on `Habit` (stored in existing JSON blob)

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

- `sub_goals`: ordered list of `{id, name}`. Empty array = not a sub-goal habit.
- `sub_goal_unit`: display label (default: `"items"`).
- No schema migration needed — stored in the existing dict blob.

### Extended completion record

```json
{
  "day": "2026-05-24",
  "done": false,
  "count": 2,
  "text": "",
  "sub_goals_done": ["fajr", "dhuhr"]
}
```

- `sub_goals_done`: list of completed sub-goal IDs for that day.
- `done` derived: `len(sub_goals_done) >= len(sub_goals)`.
- `count` mirrors `len(sub_goals_done)` for sub-goal habits.

### API Changes

**`PUT /api/v1/habits/:id`** — extend `UpdateHabit` Pydantic model to accept:
```python
sub_goals: list[dict] | None = None   # [{id, name}, ...]
sub_goal_unit: str | None = None
```

**`POST /api/v1/habits/:id/completions`** — extend `Tick` model to accept:
```python
sub_goal_id: str | None = None   # if present, toggle this sub-goal only
```
When `sub_goal_id` is present: toggle that ID in `sub_goals_done`, recalculate `count` and `done`, save.  
When absent: existing behaviour (toggle whole day).

---

## 11. Frontend File Changes

| File | Change |
|---|---|
| `static/css/styles.css` | Full rewrite — new design system |
| `templates/base.html` | New split-panel shell; remove old sidebar slot |
| `templates/index.html` | Rewrite — list panel + detail panel structure |
| `templates/login.html` | Restyle — centred card |
| `templates/habit_detail.html` | Remove — detail is now rendered inside `index.html` right panel |
| `templates/heatmap.html` | Restyle only (multi-year view, kept as-is) |
| `templates/_habit_modal.html` | Rewrite — add sub-goal fields + unit label |
| `templates/_settings_modal.html` | Restyle |
| `templates/_note_modal.html` | Restyle |
| `static/js/habits.js` | Full rewrite — new DOM, split panel, sub-goal pills |
| `static/js/calendar.js` | Replace with `monthly.js` — circle calendar, popup picker |
| `static/js/heatmap.js` | Keep `renderSingleHeatmap` + step/reset logic; update CSS class names only |
| `static/js/app.js` | Keep; add sub-goal helpers |
| `static/js/api.js` | Keep entirely — no changes |
| `static/js/notes.js` | Keep; update selectors to match restyled modal HTML |

---

## 12. What Is NOT Changing

- All FastAPI routes (`routes/pages.py`, `routes/api.py`, `routes/metrics.py`)
- Auth system (`app/auth.py`, `app/users.py`)
- Storage layer (`storage/dict.py`, `storage/storage.py`)
- Database models (`app/db.py`)
- All existing API endpoints (except the two field extensions noted above)
- `api.js` fetch wrapper
- `heatmap.js` core rendering logic
- Sortable.js vendor library

---

## 13. Success Criteria

1. Main layout matches TickTick's Habits screenshot: nav rail + week strip + grouped list + split detail panel
2. Salah (sub-goal habit) shows pill chips in the list; tapping a pill updates that sub-goal only
3. Detail panel shows 6 stat cards, monthly circle calendar, and daily goals line chart
4. Monthly calendar circles are tappable: toggle for regular habits; popup picker for sub-goal habits
5. Add/Edit modal includes sub-goal list with drag-to-reorder and unit label field
6. All screens use the unified dark design system
7. All existing habits, completions, and stats continue working unchanged
8. No regressions on import/export, API tokens, or notes features
