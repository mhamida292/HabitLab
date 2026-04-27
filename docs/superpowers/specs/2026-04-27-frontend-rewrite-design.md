# BeaverHabits Frontend Rewrite — Design

**Date:** 2026-04-27
**Status:** Approved (pending user review of this document)

## Goal

Replace the existing NiceGUI-based frontend with a vanilla-JS + Jinja-templates frontend that mirrors the visual and structural design language of [Lockbox](https://github.com/mhamida292/lockbox). Backend logic (auth, storage, habit business rules, JSON API) stays largely intact, with deletions of features unused on a single-user homelab.

The end state is one Python image that runs in a single Docker container, no Node toolchain, no build step, suitable for a personal homelab.

## Non-goals

- Multi-tenant SaaS features (Paddle, Google OAuth, public registration, password-reset email flow)
- Telemetry / error tracking (Sentry, memray)
- Telegram backup integration
- iOS-app-specific routes
- A "wow factor" feature beyond what beaverhabits already does — same features, new presentation
- Multi-theme system beyond a single dark/light pair
- Custom-CSS injection (replaced by the new design)

## Constraints

- Single-user homelab deployment
- Single Python Docker image, port 8765, SQLite by default
- Vanilla JS only — no Node/npm/Vite/build step
- Match Lockbox's modal/sidebar/card/input styling closely
- Mobile-friendly (drawer sidebar below 768px, responsive habit grid)
- Both the per-habit yearly heatmap and multi-year heatmap views are preserved

## Architecture

### Project layout (post-rewrite)

```
beaverhabits/
├── app/                       KEEP (trimmed)
│   ├── auth.py                no JWT/OAuth/password-reset paths
│   ├── db.py                  drop UserIdentityModel + UserConfigsModel
│   ├── crud.py                trim to remaining models
│   ├── dependencies.py        keep current_active_user + API-token check
│   └── users.py               drop registration endpoint
├── core/                      KEEP
│   ├── completions.py
│   └── note.py
├── storage/                   KEEP entirely
├── routes/
│   ├── api.py                 KEEP + EXTEND (primary JSON API)
│   ├── pages.py               NEW (Jinja-rendered HTML routes)
│   └── metrics.py             KEEP (cheap, useful)
├── templates/                 NEW (5 Jinja files)
├── static/                    NEW (css, js, img, manifest)
├── main.py                    mount StaticFiles + Jinja2Templates
└── configs.py                 trimmed env vars

DELETED:
  beaverhabits/frontend/             entire NiceGUI directory (~3.5k LOC)
  beaverhabits/routes/routes.py      NiceGUI @ui.page handlers
  beaverhabits/routes/google_one_tap.py
  beaverhabits/core/backup.py        Telegram backup
  beaverhabits/views.py              NiceGUI session helpers
```

### Dependency changes (`pyproject.toml`)

- **Remove:** `nicegui`, `paddle-python-sdk`, `sentry-sdk`, `memray`, `loguru`
- **Add:** `jinja2`
- **Keep:** `fastapi`, `fastapi-users[sqlalchemy]`, `sqlalchemy[asyncio]`, `pydantic`, `pytz`, `python-dateutil`, `cachetools`, `uvicorn[standard]`, `aiosqlite`, `asyncpg`

### Auth library decision

`fastapi-users` is **kept** but its registration / password-reset / OAuth routes are not wired up. Cookie-based session login/logout remains as the only flow. The first-run "create master password" is a small custom endpoint that calls existing CRUD once and refuses to run again if a user already exists.

## Information architecture

Lockbox-style single-shell pattern: most interaction happens within one main view. Distinct routes only for things that need significant page real estate.

### Routes

| Route | Renders | Purpose |
|---|---|---|
| `/` | `index.html` | Main habit grid (sidebar filters + toolbar + grid) |
| `/login` | `login.html` | Single password input (or "create master password" on first run) |
| `/habits/<id>` | `habit_detail.html` | One habit: stat cards + 26-week heatmap + notes timeline |
| `/heatmap/<id>` | `heatmap.html` | Multi-year heatmap stacked for one habit |
| `/stats` | `stats.html` | Overall stats |

### Modals (rendered into `base.html`, controlled by `app.js`)

- **Settings** — tabbed (General/theme, Chips, Import/Export, Tokens, Change password)
- **Note editor** — textarea + image upload (opens via long-press on a checkbox)
- **Confirm-delete** — generic for habit deletion, etc.

### Inline-expand patterns

- **Add habit** — clicking the toolbar `+ Add` expands a form inline at the top of the grid
- **Edit habit** — clicking a habit row's edit button expands the row in place (Lockbox `.ecard.expanded` pattern, with accent border)

### Mobile (under 768px)

- Sidebar collapses to drawer with shade overlay
- Hamburger button in toolbar
- Add button shrinks to icon-only
- Modals near-fullscreen
- Heatmap grid renders 26-week view by default on small screens

## Visual design

### Themes

Lockbox's CSS-variable theme system is adopted, scoped to **two themes only**:

- **Midnight** (default dark) — `--bg: #07080a`, `--accent: #6c8cff`
- **Arctic** (light) — `--bg: #f4f6f9`, `--accent: #2563eb`

Toggle in the header (☾ ↔ ☀). Selection persists in `localStorage` (key: `theme`) and is read on page load before paint to avoid flash.

### Typography

- **JetBrains Mono** — labels, buttons, brand mark, sort/filter pills (uppercase, letter-spacing 1.5–8px, weights 600/700)
- **DM Sans** — body content (habit names, notes, etc.)

Both loaded from Google Fonts in `base.html` `<head>`.

### Component styling

Lifted directly from Lockbox `static/css/styles.css` and adapted for habit-tracker primitives:

- Sidebar items: bordered card, accent left-border on active
- Buttons: primary (solid accent), secondary (outlined), danger (outlined red, fills on hover)
- Inputs: subtle border, light surface fill, accent-glow on focus (`box-shadow: 0 0 0 3-4px var(--accent-glow)`)
- Cards: hover bg + 3px accent left-border
- Modals: blurred backdrop, surface bg, 14px radius, slide+fade entrance
- Toasts: bottom-center pill, success-green default, auto-dismiss

### Modals match the Lockbox edit-entry visual

Mono uppercase header + small round close button, mono uppercase field labels, light-surface inputs, sticky footer with destructive button left + secondary/primary right.

## API surface

All API routes are under `/api/v1/`. Auth routes are under `/auth/`.

### Auth

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/status` | `{ setup_required: bool, logged_in: bool }` |
| POST | `/auth/setup` | NEW — creates master password (refuses if user exists) |
| POST | `/auth/login` | existing (cookie session) |
| POST | `/auth/logout` | existing |
| POST | `/auth/change-password` | NEW — settings page |

### Habits

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/habits` | list (with `?status=` filter) |
| POST | `/api/v1/habits` | create |
| GET | `/api/v1/habits/{id}` | detail |
| PUT | `/api/v1/habits/{id}` | update (name, frequency, tags, chips) |
| DELETE | `/api/v1/habits/{id}` | archive |
| GET | `/api/v1/habits/meta` | ordering |
| PUT | `/api/v1/habits/meta` | reorder |
| GET | `/api/v1/habits/{id}/completions` | records for date range |
| POST | `/api/v1/habits/{id}/completions` | tick (status, note, date) |
| GET | `/api/v1/habits/{id}/stats` | NEW — `{ streak, total, percent_30d, percent_90d }` |
| GET | `/api/v1/habits/{id}/heatmap?years=N` | NEW — pre-computed grid for multi-year view |

### Other

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/uploads` | NEW — multipart image upload, returns `{ url }` |
| GET | `/api/v1/tokens` | current API token or null |
| POST | `/api/v1/tokens` | create |
| DELETE | `/api/v1/tokens` | delete |
| GET | `/api/v1/export` | download JSON of all habit data |
| POST | `/api/v1/import` | upload JSON |

### Auth model on every request

- HTML page routes require a session cookie or redirect to `/login`
- API routes accept either the session cookie OR `Authorization: Bearer <api_token>` (existing dual-auth in `app/dependencies.py`)
- `/auth/setup` is gated by a fast `SELECT 1 FROM user LIMIT 1` and only succeeds when the table is empty

## Frontend modules

### Templates (5 Jinja files)

- `base.html` — shell: header, sidebar, toolbar slot, main slot, theme toggle script
- `login.html` — single password input; switches between "Create master password" and "Enter master password" based on server-provided `setup_required` flag
- `index.html` — habit grid, extends base
- `habit_detail.html` — one habit, extends base
- `heatmap.html` — multi-year, extends base
- `stats.html` — overall stats, extends base

### JS modules (5 files, vanilla)

| File | LOC | Responsibility |
|---|---|---|
| `api.js` | ~50 | fetch wrapper: auth, error handling, JSON helpers |
| `app.js` | ~150 | shell behavior: sidebar drawer, theme toggle, modal open/close, settings tabs |
| `habits.js` | ~300 | grid rendering, multi-state checkbox cycling, inline-expand add/edit, search/filter, long-press |
| `heatmap.js` | ~100 | color-level computation + grid render (single-year + multi-year) |
| `notes.js` | ~100 | note editor modal with image upload |

### Vendored library

`sortable.min.js` (~10 KB) — drag-to-reorder habits with touch support. Replaces the dedicated reorder page.

### CSS

One file: `static/css/styles.css`. Lifted from Lockbox `static/css/styles.css` with adaptations for habit-grid primitives (rows, multi-state checkboxes, heatmap squares). Two themes only (`midnight`, `arctic`).

## Data flow

### Habit tick (typical interaction)

1. User clicks a checkbox in a habit row
2. `habits.js` calls `cycleStatus(habitId, date, currentStatus)`
3. `api.js` issues `POST /api/v1/habits/{id}/completions { date, status }`
4. Server: `storage.set_completion(...)` → returns updated record
5. `habits.js` updates the DOM (color/icon for new status)
6. On error: toast + revert DOM optimistically

### Habit edit (inline-expand)

1. User clicks habit row's edit button
2. `habits.js` expands the row, clones a hidden form template into it, prefills with current habit data
3. User edits fields, clicks Save
4. `api.js` issues `PUT /api/v1/habits/{id}`
5. Server validates, updates, returns updated habit
6. `habits.js` collapses the form, re-renders the row
7. On validation error: inline error message under the offending field

### First-run setup

1. Clean install → `GET /` → server sees empty user table → redirect to `/login`
2. `/login` template renders "Create master password" form (server passes `setup_required=true`)
3. User enters password + confirm → `POST /auth/setup`
4. Server creates `User(email="admin@local", hashed_password=...)`, sets cookie → redirect to `/`
5. `/auth/setup` is now permanently disabled (any subsequent call returns 409)

## Error handling

### Server side

- Validation errors: FastAPI's standard 422 with field-level detail
- Auth failures: 401
- Resource not found: 404
- Unexpected exceptions: 500 with logged traceback (Python stdlib `logging`)
- All errors return JSON `{ error: "message" }` for API routes; HTML routes use Jinja error pages

### Client side (`api.js`)

- 200–299: return parsed JSON
- 401: navigate to `/login`
- Other 4xx: throw with `error.message`; caller decides toast vs. inline display
- 5xx or network error: toast "Something went wrong" + console.error
- All optimistic UI updates revert on error

### UI surfaces for errors

- Toast: success/save confirmations, transient failures
- Inline (under the field): form validation
- Full-page navigation: 401 only

## Testing

- **Backend**: extend existing pytest suite for new endpoints (`/auth/setup`, `/auth/change-password`, `/api/v1/uploads`, `/api/v1/habits/{id}/stats`, `/api/v1/habits/{id}/heatmap`). Existing tests for habit CRUD/completions stay as-is.
- **Frontend**: one Playwright smoke test covering the critical path — visit `/`, log in, add a habit, tick it, reload, verify the tick persisted.
- **Manual smoke test before merge**: `docker compose up` locally, walk through every page in both themes on desktop + mobile viewport.

No unit tests for the JS — modules are small enough that smoke testing covers them.

## Deployment

### Dockerfile (multi-stage)

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install uv && uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv ./.venv
COPY beaverhabits ./beaverhabits
ENV PATH="/app/.venv/bin:$PATH"
ENV DATA_DIR=/data
EXPOSE 8765
HEALTHCHECK CMD curl -f http://localhost:8765/health || exit 1
CMD ["uvicorn", "beaverhabits.main:app", "--host", "0.0.0.0", "--port", "8765"]
```

### docker-compose.example.yml

```yaml
services:
  beaverhabits:
    image: beaverhabits:latest
    build: .
    restart: unless-stopped
    ports:
      - "8765:8765"
    volumes:
      - ./data:/data
    environment:
      - SECRET_KEY=change-me-to-a-long-random-string
      - TIME_ZONE=America/New_York
```

### Env vars (after the trim)

| Var | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | (required) | Session cookie signing |
| `DATABASE_URL` | `sqlite+aiosqlite:////data/db.sqlite` | DB connection |
| `DATA_DIR` | `/data` | DB file + uploaded images |
| `TIME_ZONE` | system or `UTC` | Override browser-detected timezone |
| `DEFAULT_COMPLETION_STATUS_LIST` | `yes,no` | Default chips for new habits |

Removed: `PADDLE_*`, `TELEGRAM_*`, `GOOGLE_CLIENT_ID`, `SENTRY_DSN`, `MEMRAY_*`, custom-CSS-related config.

### First-time deploy

1. `git clone && cd beaverhabits`
2. `cp docker-compose.example.yml docker-compose.yml`
3. `python3 -c "import secrets; print(secrets.token_hex(32))"`
4. Edit `docker-compose.yml`, paste the key as `SECRET_KEY`
5. `docker compose up -d`
6. Browse to `http://<homelab>:8765` → "Create master password" → done

### Workflow

- **Local**: `docker compose up`, browse `http://localhost:8765`, smoke test all features
- **Server**: pull repo, set `SECRET_KEY` in compose, `docker compose up -d`

## Resource expectations

| | Current (NiceGUI) | New (Jinja+JS) |
|---|---|---|
| Idle RSS | ~150–200 MB | ~50–80 MB |
| Idle CPU | constant low (websocket keepalive) | ~0% |
| Docker image | ~250 MB | ~100 MB |
| Cold startup | ~3–5 s | ~1 s |
| Memory growth over weeks | grows with sessions | flat |

Comfortably runs on a Raspberry Pi 4.

## Future (out of scope for v1)

- Overview heatmap on the home page (a "dashboard" panel above the habit grid)
- Additional Lockbox themes beyond midnight/arctic
- Browser extension parity with Lockbox's quick-tick popup
- WebAuthn / passkeys
