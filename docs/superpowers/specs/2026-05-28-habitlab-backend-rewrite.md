# HabitLab Backend Rewrite — Design Spec

**Date:** 2026-05-28

---

## Goal

Replace the BeaverHabits backend foundation (FastAPI-Users + SQLAlchemy ORM) with a minimal, fully-owned implementation. Every request currently opens 3 nested async context managers just to verify a JWT token. The new system does one `jwt.decode()` call. The package is renamed from `beaverhabits` to `habitlab`.

---

## What Gets Deleted

- `beaverhabits/app/` — entire directory (auth.py, app.py, crud.py, db.py, dependencies.py, middelwares.py, schemas.py, users.py)
- `beaverhabits/` directory — renamed to `habitlab/`
- Dependencies removed: `fastapi-users[sqlalchemy]`, `sqlalchemy[asyncio]`, `asyncpg`
- Config options dropped: `TRUSTED_EMAIL_HEADER`, `TRUSTED_LOCAL_EMAIL`, `SECRET_KEY` (unused)

---

## New DB Schema

Two tables, accessed via raw aiosqlite. No ORM.

```sql
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Rows: ('password_hash', '$2b$...'), ('migrated_v2', 'true')

CREATE TABLE IF NOT EXISTS habit_list (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL
);
-- Always exactly one row (id=1). Single-user app.
```

DB path derived from `settings.DATABASE_URL` by stripping `sqlite+aiosqlite:///` prefix. PostgreSQL support is dropped — SQLite-only.

---

## New `habitlab/auth.py`

Replaces all of `beaverhabits/app/auth.py`, `users.py`, `schemas.py`, `dependencies.py`.

**`User` dataclass:**
```python
@dataclass
class User:
    id: int = 1  # always 1 — single user
```

**Public API:**
```python
def hash_password(plain: str) -> str
def verify_password(plain: str, hashed: str) -> bool
def create_token() -> str           # signs JWT with JWT_SECRET, lifetime = JWT_LIFETIME_SECONDS
def decode_token(token: str) -> bool
async def current_active_user(request: Request) -> User   # FastAPI dependency
```

Implementation:
- Passwords: `passlib.hash.bcrypt` — compatible with existing hashes created by FastAPI-Users.
- Tokens: `PyJWT`, algorithm `HS256`, `sub` claim = `"habitlab"`.
- `current_active_user`: extracts `Authorization: Bearer <token>` header → `decode_token()` → returns `User()`. Raises HTTP 401 if missing or invalid. No context managers.

---

## New `habitlab/db.py`

Replaces `beaverhabits/app/db.py` and `beaverhabits/app/crud.py`.

**Public API:**
```python
async def init_db() -> None                        # create tables if not exist
async def get_password_hash() -> str | None
async def set_password_hash(hashed: str) -> None
async def get_habit_list() -> dict                 # returns {} if no row yet
async def save_habit_list(data: dict) -> None
async def reset_app() -> None                      # DELETE password_hash row + habit_list row — used by /auth/wipe
```

`reset_app()` deletes both rows so that `get_password_hash()` returns `None` and `/auth/status` responds with `setup_required: true`, returning the app to first-run state.

Each function opens a connection, executes one query, commits (if write), closes. No engine, no session, no session maker.

---

## New `habitlab/routes/auth.py`

Replaces `beaverhabits/app/app.py` (`init_auth_routes`). Mounted at `/auth`.

| Method | Path | Auth required | Body | Returns |
|---|---|---|---|---|
| `POST` | `/auth/login` | No | `{password: str}` | `{access_token, token_type}` |
| `GET` | `/auth/status` | No | — | `{setup_required: bool}` |
| `POST` | `/auth/setup` | No | `{password: str}` | `{ok: true}` — 409 if already set up |
| `POST` | `/auth/change-password` | Yes | `{current_password, new_password}` | 204 |
| `POST` | `/auth/wipe` | Yes | — | 204 — calls `db.reset_app()`, frontend clears JWT and redirects to `/login` |

`/auth/login` accepts JSON `{"password": "..."}` — no `username` field (single user). This is a breaking change from the FastAPI-Users form-encoded `/auth/jwt/login` endpoint, so `login.html` must also be updated (see below).

---

## `tools/migrate_db.py`

One-time migration from old BeaverHabits schema to new HabitLab schema. Called automatically from `main.py` startup before `init_db()` if the old schema is detected (presence of `user` table).

**Steps:**
1. Detect old schema: `SELECT name FROM sqlite_master WHERE type='table' AND name='user'`
2. Back up DB file to `<path>.pre-migration.bak`
3. Read `hashed_password` from `user` table (bcrypt hash, compatible with passlib — no rehashing)
4. Read `data` from `habit_list` table
5. Create `settings` table; insert `('password_hash', hashed_password)`
6. Rename old `habit_list` to `habit_list_old`; create new `habit_list` (no `user_id`); copy `data`
7. Drop `habit_list_old`, `user`, `user_images`, `user_api_tokens`
8. Insert `('migrated_v2', 'true')` sentinel so migration never re-runs
9. Commit

If DB file doesn't exist (fresh install), migration is skipped and `init_db()` creates the new schema from scratch.

---

## Updated Files

### `habitlab/main.py`

- Remove: `from habitlab.app.app import init_auth_routes`, `from habitlab.app.db import create_db_and_tables`
- Add: `from habitlab.db import init_db`, `from habitlab.routes.auth import router as auth_router`
- Startup: call migration check → `init_db()` instead of `create_db_and_tables()`
- Replace `init_auth_routes(app)` with `app.include_router(auth_router)`

### `habitlab/storage/user_db.py`

`UserDatabaseStorage` no longer queries by `user.id` (single row). Updated:

```python
from habitlab import db as habitdb

class UserDatabaseStorage(UserStorage[DictHabitList]):
    async def get_user_habit_list(self, user: User) -> DictHabitList:
        return DictHabitList(await habitdb.get_habit_list())

    async def init_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)

    async def save_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)
```

### `habitlab/routes/api.py` and `habitlab/routes/pages.py`

Import change only:
```python
# Before:
from beaverhabits.app.dependencies import current_active_user
from beaverhabits.app.db import User
# After:
from habitlab.auth import current_active_user, User
```

### `habitlab/configs.py`

Remove: `SECRET_KEY`, `TRUSTED_EMAIL_HEADER`, `TRUSTED_LOCAL_EMAIL`.
Keep: `DATABASE_URL`, `JWT_SECRET`, `JWT_LIFETIME_SECONDS`, all other settings.

### `habitlab/templates/login.html`

Update `login()` JS function from form-encoded to JSON, drop `username` field:

```js
async function login(password) {
    const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
    });
    if (!resp.ok) return null;
    return (await resp.json()).access_token;
}
```

---

## The Rename: `beaverhabits` → `habitlab`

Rename the directory with `git mv beaverhabits habitlab`, then update all import statements across:

- All `.py` files in `habitlab/` (imports change from `beaverhabits.*` to `habitlab.*`)
- All `.py` files in `tests/`
- `pyproject.toml` — package name, entry point script
- `CLAUDE.md` — references to `beaverhabits`

---

## `pyproject.toml` Changes

**Remove:**
```
fastapi-users[sqlalchemy]
sqlalchemy[asyncio]
asyncpg
```

**Add:**
```
pyjwt>=2.8.0
passlib[bcrypt]>=1.7.4
```

**Rename:**
```toml
name = "habitlab"

[project.scripts]
main = "habitlab.routes:main"
```

---

## Existing Browser Sessions

After deployment, all existing JWTs (signed by FastAPI-Users) will be invalid. Users will be redirected to `/login` and need to enter their password once. This is expected and unavoidable — the signing key format changes.

---

## Out of Scope

- Renaming the `.user/habits.db` file
- Changing any API endpoint URLs other than the auth endpoints
- Changing any frontend templates other than `login.html`
- PostgreSQL support (dropped — SQLite only going forward)
- API tokens (never used, not replaced)
- Multi-user support
