# HabitLab — Claude Developer Guide

This is a self-hosted habit tracker. FastAPI + Jinja2 backend, vanilla-JS ES-module frontend, SQLite storage. No React, no build step.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + Starlette, Python 3.12 |
| Templates | Jinja2 (server-rendered HTML shells) |
| Frontend | Vanilla JS ES modules, no bundler |
| Storage | SQLite via SQLAlchemy async + aiosqlite |
| Auth | FastAPI-Users (session JWT + long-lived API tokens) |
| CSS | Plain CSS with custom properties (design tokens) |
| Icons | Lucide via CDN, `buildIconEl()` wrapper in `icons.js` |
| Drag-to-reorder | SortableJS at `/static/vendor/sortable.min.js` |
| Timer | Pomodoro in `timer.js`, Web Audio API chime |
| PWA | `manifest.json`, `apple-touch-icon.png`, `favicon.svg` |

---

## Project Layout

```
beaverhabits/
├── main.py                     # App factory, middleware, static-file no-cache
├── configs.py                  # Settings (env vars)
├── routes/
│   ├── api.py                  # All /api/v1/* REST endpoints
│   └── views.py                # Page routes (GET /, /notes, /heatmap, …)
├── storage/
│   ├── storage.py              # Abstract Habit / HabitList / HabitRecord interfaces
│   └── dict.py                 # DictHabitList — JSON blob stored in SQLite
├── templates/
│   ├── base.html               # Shell: nav rail, mobile tab bar, all overlays
│   ├── index.html              # Habits page
│   ├── notes.html              # Notes page
│   ├── _settings_modal.html    # Theme picker, export/import, API token
│   ├── _note_modal.html        # Quick note composer
│   └── _habit_modal.html       # Create/edit habit form
└── static/
    ├── css/styles.css          # All styles; one block per theme
    ├── js/
    │   ├── api.js              # Thin fetch wrapper: api.get/post/put/delete/patch
    │   ├── app.js              # Settings modal, toast, global helpers
    │   ├── habits.js           # Habits page: list, detail panel, calendar wiring
    │   ├── monthly.js          # Monthly calendar component (mountCalendar)
    │   ├── notes.js            # Note editor modal
    │   ├── notes-page.js       # Notes page logic
    │   ├── icons.js            # buildIconEl(name, size), isEmoji(str), applyIcons()
    │   ├── heatmap.js          # Yearly heatmap SVG
    │   ├── timer.js            # Pomodoro focus timer
    │   └── calendar.js         # Lightweight calendar (used in habit-creation modal)
    └── vendor/
        └── sortable.min.js     # SortableJS (no CDN dep for drag-to-reorder)
```

---

## Running Locally

```bash
uv sync
uv run uvicorn beaverhabits.main:app --reload --port 8765
```

Visit `http://localhost:8765`. Create a master password on first run.

---

## Key Patterns & Conventions

### ES Modules + Cache Busting

All JS files are `type="module"`. The browser module cache is URL-keyed — `habits.js` imports `monthly.js` at a bare path (no `?v=…`), so **Cache-Control middleware** in `main.py` adds `no-cache` to every `/static/js/*.js` response. This means the browser always revalidates before using a cached file (returns 304 if unchanged — still fast).

`<script>` tags in HTML use `?v={{ asset_version }}` to bust the entry-point cache. Do not add a second `<script type="module">` tag for a file already imported by another module — the browser runs them as separate instances.

### CSS Theming

All colours are CSS custom properties defined per `[data-theme="…"]` block in `styles.css`. Available themes: `midnight` (default), `arctic`, `obsidian`, `violet`, `paper`, `sage`, `coffee`, `obsidian-light`. Use `var(--bg)`, `var(--surface)`, `var(--accent)`, `var(--text)`, `var(--border)`, etc. Never hardcode colour values in component CSS.

### Date Handling — CRITICAL

**Never use `new Date().toISOString().slice(0, 10)`** — `toISOString()` returns UTC. For users in UTC+ timezones this gives tomorrow's date when it's late evening local time, causing date-matching bugs (wrong calendar cell, sub-goals not ticking, 50% all-time rate for same-day completions).

**Always use `localIso()`** (defined in `habits.js` and `monthly.js`):

```js
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
```

**Stats API** — The `/api/v1/habits/{id}/stats` endpoint accepts `?today=YYYY-MM-DD`. Always pass the client's local date:

```js
api.get(`/api/v1/habits/${id}/stats?today=${localIso()}`)
```

The server falls back to `datetime.date.today()` (UTC) only when the param is omitted.

### Icons

Use `buildIconEl(nameOrEmoji, sizePx)` from `icons.js` to render icons. It returns a DOM element — either a `<i data-lucide="…">` (Lucide SVG) or a `<span>` (emoji). Call `applyIcons()` after inserting Lucide elements into the DOM. Use `isEmoji(str)` to distinguish the two.

Do not render icon names as raw text. The pattern `habit.icon + ' ' + habit.name` is **wrong** for Lucide icon names — use `buildIconEl` for the icon, then a separate text node for the name.

### API Shape

- All endpoints under `/api/v1/`. Session JWT or `Authorization: Bearer <token>`.
- `GET /habits` — full habit list with records
- `GET /habits/{id}/stats?today=YYYY-MM-DD` — streak, totals, all-time %, monthly
- `POST /habits/{id}/completions` — tick a date; optionally `sub_goal_id` to toggle a sub-goal
- `PUT /habits/meta` with `{ order: [id, …] }` — persist drag-reorder

### Sub-Goals

A habit can have `sub_goals: [{id, name}, …]`. When toggling a sub-goal, POST to completions with `sub_goal_id`. The response includes `sub_goals_done: [id, …]`. The `renderSubGoalsSection(habit)` function reads today's record from `habit.records` using `localIso()`. The `cal:toggled` DOM event (dispatched by `monthly.js`) triggers re-renders in `habits.js`.

### Pomodoro Timer

`timer.js` is a standalone module (no imports). It anchors to wall clock (`Date.now()` + `_remainingAtStart`) to prevent background-tab throttling drift. The `visibilitychange` listener calls `tick()` immediately when the tab regains focus. Durations are persisted in `localStorage` (`timer-work`, `timer-break`). Chime uses Web Audio API (no file dependency).

---

## API — Stats Endpoint Detail

`GET /api/v1/habits/{id}/stats?today=YYYY-MM-DD`

| Field | Description |
|---|---|
| `streak` | Consecutive done days ending on `today` |
| `total` | Total fully-done days ever |
| `all_time_rate` | For sub-goal habits: total individual goals done / (n_sub_goals × days_elapsed) × 100. For regular: done_days / days_elapsed × 100. Capped at 100%. |
| `monthly_checkins` | Fully-done days this calendar month |
| `percent_7d / 30d / 90d` | Scoped % within that window |

`effective_start` for all-time rate uses the earliest of `date_started` and the earliest record with any completion, so retroactive data doesn't inflate the rate.

---

## Common Gotchas

| Symptom | Likely cause |
|---|---|
| Sub-goals show unchecked despite being done | `toISOString()` used for date lookup → wrong date for UTC+ users |
| All-time % is 50% on day 1 | Server UTC ahead of user's local date; fix: pass `?today=localIso()` |
| Calendar shows ✓ on future dates | paintCalCircle doesn't guard `.future` cells — add early return |
| Drag reorder lost on refresh | `saveHabitOrder()` must call `PUT /api/v1/habits/meta` with all IDs |
| Module changes not picked up | Browser cached old JS — the no-cache middleware should handle it; hard-refresh with Ctrl+Shift+R to confirm |
| Lucide icon name rendered as text | Used raw `habit.icon` string in innerHTML instead of `buildIconEl()` |
| Stat cards stale after calendar toggle | `refreshDetailStats()` must be called from the `cal:toggled` event handler |
