# HabitLab

A self-hosted habit tracker. One Docker container, one master password, vanilla web UI.

This is a fork of [daya0576/beaverhabits](https://github.com/daya0576/beaverhabits) with the NiceGUI frontend replaced by a vanilla-JS + Jinja templates frontend, modeled after [Lockbox](https://github.com/mhamida292/lockbox).

## Features

- Daily habit grid with check-in circles and streak badges
- Sub-goals — break a habit into named steps (e.g. Salah prayers), track each individually
- Monthly calendar view per habit with partial-progress rings
- Yearly heatmap
- Detail panel — trend chart, sub-goal checklist, recent notes, full stat cards
- Drag-to-reorder habits within each category
- Notes — standalone note-taking with optional habit linking
- Pomodoro focus timer — customisable durations, chime, browser notifications, persists across navigation
- Stat cards — current streak, total check-ins, monthly check-ins, all-time completion %
- Tags / categories with collapsible groups
- Search and filter
- 8 themes — Midnight (default dark), Obsidian, Violet, Arctic, Paper, Sage, Coffee, Obsidian Light
- Single-user master-password login
- API tokens for scripts (Home Assistant, iOS Shortcuts, etc.)
- Import / export JSON
- PWA-ready (installable on iPhone/Android, offline shell, browser notifications)

## Quick Start

```bash
git clone <your-fork-url> habitlab
cd habitlab
cp docker-compose.example.yml docker-compose.yml
python3 -c "import secrets; print(secrets.token_hex(32))"
# Paste the printed value into docker-compose.yml as SECRET_KEY
docker compose up -d
```

Then visit `http://<host>:8765` and create your master password on first run.

## Configuration

| Var | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | (required) | Session signing |
| `DATABASE_URL` | `sqlite+aiosqlite:////data/db.sqlite` | DB connection |
| `DATA_DIR` | `/data` | DB file + uploaded images |
| `TIME_ZONE` | `UTC` | Override system timezone |
| `LOG_LEVEL` | `INFO` | Python log level |
| `DEBUG` | `false` | Verbose logging |

## Development

```bash
uv sync
uv run uvicorn beaverhabits.main:app --reload --port 8765
```

Visit `http://localhost:8765`. Static files are served from `beaverhabits/static/`; templates from `beaverhabits/templates/`. JSON API is under `/api/v1/`. The OpenAPI spec is at `/docs`.

See `CLAUDE.md` for the full developer guide — architecture, patterns, and common gotchas.

### Testing

```bash
uv run pytest tests/
```

End-to-end smoke test (Playwright):

```bash
uv run --group e2e playwright install chromium
uv run --group e2e pytest tests/e2e/
```

## API

All endpoints under `/api/v1/` accept either a session JWT (from `/auth/login`) or a long-lived API token (managed in Settings → API token), passed as `Authorization: Bearer <token>`. See `/docs` for the full schema.

Key endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/habits` | List all habits with records |
| `POST` | `/api/v1/habits` | Create a habit |
| `PUT` | `/api/v1/habits/{id}` | Update habit metadata / sub-goals |
| `POST` | `/api/v1/habits/{id}/completions` | Tick a date (or toggle a sub-goal) |
| `GET` | `/api/v1/habits/{id}/stats?today=YYYY-MM-DD` | Streak, totals, all-time % |
| `PUT` | `/api/v1/habits/meta` | Persist drag-reorder `{ order: [id, …] }` |
| `GET` | `/api/v1/notes` | List notes (optionally filtered by habit) |
| `POST` | `/api/v1/notes` | Create a note |
| `GET` | `/api/v1/export` | Full JSON export |
| `POST` | `/api/v1/import` | Restore from JSON export |

## Backup

The database is a single SQLite file at `${DATA_DIR}/db.sqlite`:

```bash
docker cp habitlab:/data/db.sqlite ./habitlab-backup.db
```

Or use Settings → Export JSON for a portable dump.
