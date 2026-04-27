# HabitLab

A self-hosted habit tracker. One Docker container, one master password, vanilla web UI.

This is a fork of [daya0576/beaverhabits](https://github.com/daya0576/beaverhabits) with the NiceGUI frontend replaced by a vanilla-JS + Jinja templates frontend, modeled after [Lockbox](https://github.com/mhamida292/lockbox).

## Features

- Daily habit grid with multi-state checkboxes
- Per-habit yearly heatmap and multi-year heatmap
- Notes per day, with optional image upload
- Tags / categories
- Streak, 30-day, total stats
- Drag-to-reorder
- Search, filter, sort
- Two themes (midnight / arctic)
- Single-user master-password login
- API tokens for scripts (Home Assistant, iOS Shortcuts, etc.)
- Import / export JSON
- PWA-ready

## Quick Start

```bash
git clone <your-fork-url> beaverhabits
cd beaverhabits
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
| `DEFAULT_COMPLETION_STATUS_LIST` | `yes,no` | Default chips for new habits |
| `LOG_LEVEL` | `INFO` | Python log level |
| `DEBUG` | `false` | Verbose logging |

## Development

```bash
uv sync
uv run uvicorn beaverhabits.main:app --reload --port 8765
```

Visit `http://localhost:8765`. Static files are served from `beaverhabits/static/`; templates from `beaverhabits/templates/`. JSON API is under `/api/v1/`. The OpenAPI spec is at `/docs`.

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

## Backup

The database is a single SQLite file at `${DATA_DIR}/db.sqlite`:

```bash
docker cp beaverhabits:/data/db.sqlite ./vault-backup.db
```

Or use Settings → Export JSON for a portable dump.
