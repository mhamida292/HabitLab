# HabitLab Backend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FastAPI-Users + SQLAlchemy with minimal bcrypt/PyJWT auth and raw aiosqlite, rename the package from `beaverhabits` to `habitlab`, and preserve all existing habit data via an automatic one-time migration.

**Architecture:** New `habitlab/models.py` defines a `User` dataclass; `habitlab/db.py` wraps aiosqlite with 5 functions; `habitlab/auth.py` handles bcrypt + PyJWT; `habitlab/routes/auth.py` exposes auth endpoints. The "big switch" (Task 7) atomically updates all consumers and rewrites `conftest.py` so tests stay green throughout.

**Tech Stack:** FastAPI, aiosqlite (direct), PyJWT, passlib[bcrypt], pytest-asyncio.

---

## File Map

| Action | Path |
|---|---|
| Rename dir | `beaverhabits/` → `habitlab/` |
| Create | `habitlab/models.py` |
| Create | `habitlab/db.py` |
| Create | `tests/test_db.py` |
| Create | `habitlab/auth.py` |
| Create | `tests/test_auth_new.py` |
| Create | `habitlab/routes/auth.py` |
| Create | `tools/migrate_db.py` |
| Update | `habitlab/storage/storage.py` |
| Update | `habitlab/storage/user_db.py` |
| Update | `habitlab/routes/api.py` |
| Update | `habitlab/routes/pages.py` |
| Update | `tests/conftest.py` |
| Update | `habitlab/configs.py` |
| Update | `habitlab/templates/login.html` |
| Update | `habitlab/main.py` |
| Delete | `habitlab/app/` (entire directory) |
| Update | `pyproject.toml` |

---

### Task 1: Rename `beaverhabits/` → `habitlab/` and update all imports

**Files:**
- Rename: `beaverhabits/` → `habitlab/`
- Modify: all `.py` files in `habitlab/` and `tests/`
- Modify: `pyproject.toml` (name only — deps unchanged yet)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Rename the package directory**

```bash
git mv beaverhabits habitlab
```

- [ ] **Step 2: Replace all `beaverhabits` references in Python files**

```bash
find habitlab tests -name "*.py" | xargs sed -i 's/beaverhabits/habitlab/g'
```

- [ ] **Step 3: Update `pyproject.toml` package name and entry point**

In `pyproject.toml`, change:
```toml
name = "beaverhabits"
```
to:
```toml
name = "habitlab"
```

And change:
```toml
main = "beaverhabits.routes:main"
```
to:
```toml
main = "habitlab.routes:main"
```

- [ ] **Step 4: Update `CLAUDE.md` package references**

```bash
sed -i 's/beaverhabits\//habitlab\//g' CLAUDE.md
```

- [ ] **Step 5: Verify imports resolve**

```bash
uv run python -c "from habitlab.main import app; print('OK')"
```

Expected: `OK`

- [ ] **Step 6: Run tests to confirm nothing broke**

```bash
uv run pytest tests/ -q
```

Expected: all 62 tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: rename package beaverhabits → habitlab"
```

---

### Task 2: Create `habitlab/models.py`

**Files:**
- Create: `habitlab/models.py`

- [ ] **Step 1: Create the file**

```python
# habitlab/models.py
from dataclasses import dataclass


@dataclass
class User:
    """Single-user app — always id=1. Used as a dependency return type."""
    id: int = 1
```

- [ ] **Step 2: Verify import**

```bash
uv run python -c "from habitlab.models import User; print(User())"
```

Expected: `User(id=1)`

- [ ] **Step 3: Commit**

```bash
git add habitlab/models.py
git commit -m "feat: add User dataclass in habitlab/models.py"
```

---

### Task 3: Create `habitlab/db.py` and tests

**Files:**
- Create: `habitlab/db.py`
- Create: `tests/test_db.py`

- [ ] **Step 1: Write `tests/test_db.py`**

```python
# tests/test_db.py
import pytest
import habitlab.db as db_module


@pytest.fixture(autouse=True)
async def tmp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", db_path)
    await db_module.init_db()


@pytest.mark.asyncio
async def test_get_password_hash_returns_none_initially():
    assert await db_module.get_password_hash() is None


@pytest.mark.asyncio
async def test_set_and_get_password_hash():
    await db_module.set_password_hash("$2b$12$fakehash")
    assert await db_module.get_password_hash() == "$2b$12$fakehash"


@pytest.mark.asyncio
async def test_get_habit_list_returns_empty_dict_initially():
    assert await db_module.get_habit_list() == {}


@pytest.mark.asyncio
async def test_save_and_get_habit_list():
    data = {"habits": [{"id": "abc", "name": "Run"}]}
    await db_module.save_habit_list(data)
    assert await db_module.get_habit_list() == data


@pytest.mark.asyncio
async def test_save_habit_list_overwrites_previous():
    await db_module.save_habit_list({"habits": [{"id": "1"}]})
    await db_module.save_habit_list({"habits": [{"id": "2"}]})
    result = await db_module.get_habit_list()
    assert result == {"habits": [{"id": "2"}]}


@pytest.mark.asyncio
async def test_reset_app_clears_password_and_habits():
    await db_module.set_password_hash("$2b$12$fakehash")
    await db_module.save_habit_list({"habits": []})
    await db_module.reset_app()
    assert await db_module.get_password_hash() is None
    assert await db_module.get_habit_list() == {}
```

- [ ] **Step 2: Run tests to confirm they fail (module not found)**

```bash
uv run pytest tests/test_db.py -q
```

Expected: FAIL — `ModuleNotFoundError: No module named 'habitlab.db'` (or similar import error).

- [ ] **Step 3: Create `habitlab/db.py`**

```python
# habitlab/db.py
import json
import re
from pathlib import Path

import aiosqlite

from habitlab.configs import settings


def _db_path() -> str:
    m = re.match(r"^sqlite\+aiosqlite:///(.+)$", settings.DATABASE_URL)
    return m.group(1) if m else settings.DATABASE_URL


DB_PATH: str = _db_path()


async def init_db() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS habit_list (
                id   INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def get_password_hash() -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM settings WHERE key = 'password_hash'"
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row else None


async def set_password_hash(hashed: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?)",
            (hashed,),
        )
        await db.commit()


async def get_habit_list() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT data FROM habit_list WHERE id = 1") as cur:
            row = await cur.fetchone()
            return json.loads(row[0]) if row else {}


async def save_habit_list(data: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO habit_list (id, data) VALUES (1, ?)",
            (json.dumps(data),),
        )
        await db.commit()


async def reset_app() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM settings WHERE key = 'password_hash'")
        await db.execute("DELETE FROM habit_list WHERE id = 1")
        await db.commit()
```

- [ ] **Step 4: Run new tests**

```bash
uv run pytest tests/test_db.py -v
```

Expected: 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
uv run pytest tests/ -q
```

Expected: all tests pass (62 existing + 6 new = 68).

- [ ] **Step 6: Commit**

```bash
git add habitlab/db.py tests/test_db.py
git commit -m "feat: add habitlab/db.py — raw aiosqlite storage layer"
```

---

### Task 4: Create `habitlab/auth.py` and tests

**Files:**
- Create: `habitlab/auth.py`
- Create: `tests/test_auth_new.py`

- [ ] **Step 1: Write `tests/test_auth_new.py`**

```python
# tests/test_auth_new.py
import pytest
from habitlab.auth import hash_password, verify_password, create_token, decode_token


def test_hash_and_verify_correct_password():
    hashed = hash_password("correct-horse-battery")
    assert verify_password("correct-horse-battery", hashed)


def test_verify_wrong_password_returns_false():
    hashed = hash_password("correct-horse-battery")
    assert not verify_password("wrong-password", hashed)


def test_create_token_returns_string():
    token = create_token()
    assert isinstance(token, str)
    assert len(token) > 20


def test_decode_valid_token():
    token = create_token()
    assert decode_token(token) is True


def test_decode_invalid_token():
    assert decode_token("not.a.jwt") is False


def test_decode_garbage_token():
    assert decode_token("") is False
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
uv run pytest tests/test_auth_new.py -q
```

Expected: FAIL — `ModuleNotFoundError`.

- [ ] **Step 3: Create `habitlab/auth.py`**

```python
# habitlab/auth.py
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from fastapi.security.utils import get_authorization_scheme_param
from passlib.hash import bcrypt
from starlette.status import HTTP_401_UNAUTHORIZED

from habitlab.configs import settings
from habitlab.models import User


def hash_password(plain: str) -> str:
    return bcrypt.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.verify(plain, hashed)


def create_token() -> str:
    payload = {
        "sub": "habitlab",
        "exp": datetime.now(timezone.utc)
        + timedelta(seconds=settings.JWT_LIFETIME_SECONDS),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> bool:
    try:
        jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return True
    except jwt.PyJWTError:
        return False


def _get_bearer_token(request: Request) -> Optional[str]:
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None
    scheme, param = get_authorization_scheme_param(authorization)
    return param if scheme.lower() == "bearer" else None


async def current_active_user(request: Request) -> User:
    token = _get_bearer_token(request)
    if not token or not decode_token(token):
        raise HTTPException(
            status_code=HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return User()
```

- [ ] **Step 4: Run new tests**

```bash
uv run pytest tests/test_auth_new.py -v
```

Expected: 6 tests pass.

- [ ] **Step 5: Run full suite**

```bash
uv run pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add habitlab/auth.py tests/test_auth_new.py
git commit -m "feat: add habitlab/auth.py — bcrypt + PyJWT auth layer"
```

---

### Task 5: Create `habitlab/routes/auth.py`

**Files:**
- Create: `habitlab/routes/auth.py`

- [ ] **Step 1: Create the file**

```python
# habitlab/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from habitlab import db
from habitlab.auth import create_token, current_active_user, hash_password, verify_password
from habitlab.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    password: str


class SetupBody(BaseModel):
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)


@router.post("/login")
async def login(body: LoginBody):
    hashed = await db.get_password_hash()
    if not hashed or not verify_password(body.password, hashed):
        raise HTTPException(status_code=400, detail="Wrong password")
    return {"access_token": create_token(), "token_type": "bearer"}


@router.get("/status")
async def auth_status():
    hashed = await db.get_password_hash()
    return {"setup_required": hashed is None}


@router.post("/setup")
async def setup(body: SetupBody):
    existing = await db.get_password_hash()
    if existing:
        raise HTTPException(status_code=409, detail="Setup already completed")
    await db.set_password_hash(hash_password(body.password))
    return {"ok": True}


@router.post("/change-password", status_code=204)
async def change_password(
    body: ChangePasswordBody,
    user: User = Depends(current_active_user),
):
    hashed = await db.get_password_hash()
    if not hashed or not verify_password(body.current_password, hashed):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.set_password_hash(hash_password(body.new_password))
    return Response(status_code=204)


@router.post("/wipe", status_code=204)
async def wipe(user: User = Depends(current_active_user)):
    await db.reset_app()
    return Response(status_code=204)
```

- [ ] **Step 2: Verify import**

```bash
uv run python -c "from habitlab.routes.auth import router; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add habitlab/routes/auth.py
git commit -m "feat: add habitlab/routes/auth.py — minimal auth endpoints"
```

---

### Task 6: Create `habitlab/migrate.py` and `tools/migrate_db.py`

The migration logic lives in `habitlab/migrate.py` (importable by `main.py`). The `tools/migrate_db.py` is a thin CLI wrapper for running it manually.

**Files:**
- Create: `habitlab/migrate.py`
- Create: `tools/migrate_db.py`

- [ ] **Step 1: Create `habitlab/migrate.py`**

```python
# habitlab/migrate.py
"""One-time migration from BeaverHabits schema to HabitLab schema."""
import shutil
from pathlib import Path

import aiosqlite


async def needs_migration(db_path: str) -> bool:
    if not Path(db_path).exists():
        return False
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user'"
        ) as cur:
            return bool(await cur.fetchone())


async def _run_migration(db_path: str) -> None:
    backup = db_path + ".pre-migration.bak"
    shutil.copy2(db_path, backup)
    print(f"  Backed up DB to {backup}")

    async with aiosqlite.connect(db_path) as db:
        async with db.execute("SELECT hashed_password FROM user LIMIT 1") as cur:
            row = await cur.fetchone()
            hashed_password = row[0] if row else None

        async with db.execute("SELECT data FROM habit_list LIMIT 1") as cur:
            row = await cur.fetchone()
            habit_data = row[0] if row else "{}"

        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        if hashed_password:
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?)",
                (hashed_password,),
            )

        await db.execute("ALTER TABLE habit_list RENAME TO habit_list_old")
        await db.execute(
            """
            CREATE TABLE habit_list (
                id   INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            )
            """
        )
        await db.execute(
            "INSERT INTO habit_list (id, data) VALUES (1, ?)", (habit_data,)
        )

        for table in ("habit_list_old", "user", "user_images", "user_api_tokens"):
            await db.execute(f"DROP TABLE IF EXISTS {table}")

        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_v2', 'true')"
        )
        await db.commit()

    print("  Migration complete.")


async def migrate_if_needed(db_path: str) -> None:
    if await needs_migration(db_path):
        print(f"Old schema detected in {db_path}. Running migration...")
        await _run_migration(db_path)
```

- [ ] **Step 2: Create `tools/migrate_db.py`** (CLI wrapper)

```python
#!/usr/bin/env python3
"""CLI wrapper — run the DB migration manually.

Usage: uv run python tools/migrate_db.py
"""
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from habitlab.migrate import migrate_if_needed


def _get_db_path() -> str:
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./.user/habits.db")
    m = re.match(r"^sqlite\+aiosqlite:///(.+)$", url)
    return m.group(1) if m else url


if __name__ == "__main__":
    asyncio.run(migrate_if_needed(_get_db_path()))
```

- [ ] **Step 3: Commit**

```bash
git add habitlab/migrate.py tools/migrate_db.py
git commit -m "feat: add habitlab/migrate.py — one-time schema migration"
```

---

### Task 7: The big switch — update all consumers and rewrite conftest

This task atomically cuts over all consumers from the old SQLAlchemy/FastAPI-Users stack to the new auth/db modules, and rewrites `conftest.py` so tests stay green.

**Files:**
- Modify: `habitlab/storage/storage.py`
- Modify: `habitlab/storage/user_db.py`
- Modify: `habitlab/routes/api.py`
- Modify: `habitlab/routes/pages.py`
- Modify: `tests/conftest.py`

- [ ] **Step 1: Update `habitlab/storage/storage.py` — change User import**

Find and replace:
```python
from habitlab.app.db import User
```
With:
```python
from habitlab.models import User
```

- [ ] **Step 2: Rewrite `habitlab/storage/user_db.py`**

Replace the entire file with:

```python
# habitlab/storage/user_db.py
from habitlab import db as habitdb
from habitlab.models import User
from habitlab.storage.dict import DictHabitList
from habitlab.storage.storage import UserStorage


class UserDatabaseStorage(UserStorage[DictHabitList]):
    async def get_user_habit_list(self, user: User) -> DictHabitList:
        data = await habitdb.get_habit_list()
        return DictHabitList(data)

    async def init_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)

    async def save_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)
```

- [ ] **Step 3: Update `habitlab/routes/api.py` — swap auth imports, remove token endpoints**

Replace these imports at the top of `api.py`:
```python
from habitlab.app import crud as auth_crud
from habitlab.app.db import User
from habitlab.app.dependencies import current_active_user
```
With:
```python
from habitlab.auth import current_active_user
from habitlab.models import User
```

Then delete the three API token endpoint handlers (lines ~540–556):
```python
@api_router.get("/tokens", tags=["tokens"])
async def get_token(user: User = Depends(current_active_user)):
    token = await auth_crud.get_user_api_token(user)
    return {"token": token}


@api_router.post("/tokens", tags=["tokens"])
async def create_token(user: User = Depends(current_active_user)):
    token = await auth_crud.create_user_api_token(user)
    return {"token": token}


@api_router.delete("/tokens", tags=["tokens"], status_code=204)
async def delete_token(user: User = Depends(current_active_user)):
    await auth_crud.delete_user_api_token(user)
```

Verify `auth_crud` is no longer referenced anywhere in the file:
```bash
grep "auth_crud" habitlab/routes/api.py
```
Expected: no output.

- [ ] **Step 4: Update `habitlab/routes/pages.py` — replace SQLAlchemy session with db call**

Replace these imports:
```python
from sqlalchemy import func, select
from habitlab.app.db import User, get_async_session
```
With:
```python
from habitlab import db as habitdb
```

Replace the `_has_user()` function and the login route's `Depends(get_async_session)`:

Old:
```python
async def _has_user(session) -> bool:
    result = await session.execute(select(func.count()).select_from(User))
    return result.scalar_one() > 0
```

New:
```python
async def _setup_required() -> bool:
    return await habitdb.get_password_hash() is None
```

In the login route, replace:
```python
async def login_page(request: Request, session=Depends(get_async_session)):
    setup_required = not await _has_user(session)
```
With:
```python
async def login_page(request: Request):
    setup_required = await _setup_required()
```

- [ ] **Step 5: Rewrite `tests/conftest.py`**

Replace the entire file with:

```python
# tests/conftest.py
import pytest
from httpx import AsyncClient, ASGITransport

import habitlab.db as db_module
from habitlab.auth import current_active_user
from habitlab.main import app
from habitlab.models import User


@pytest.fixture(autouse=True)
async def use_tmp_db(tmp_path, monkeypatch):
    """Redirect all DB calls to a fresh temp SQLite file for each test."""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", db_path)
    await db_module.init_db()


@pytest.fixture
async def authed_client(use_tmp_db):
    """Authenticated test client — bypasses JWT validation."""

    async def override_current_active_user():
        return User()

    app.dependency_overrides[current_active_user] = override_current_active_user

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def habit(authed_client):
    """Create a test habit via the API."""
    response = await authed_client.post(
        "/api/v1/habits",
        json={"name": "Test Habit", "target_count": 1},
    )
    assert response.status_code == 200, f"Failed to create habit: {response.text}"
    return response.json()
```

- [ ] **Step 6: Run tests**

```bash
uv run pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add habitlab/storage/storage.py habitlab/storage/user_db.py \
        habitlab/routes/api.py habitlab/routes/pages.py \
        tests/conftest.py
git commit -m "feat: cut over all consumers to new auth/db — drop SQLAlchemy dependencies"
```

---

### Task 8: Update configs, login.html, and main.py

**Files:**
- Modify: `habitlab/configs.py`
- Modify: `habitlab/templates/login.html`
- Modify: `habitlab/main.py`

- [ ] **Step 1: Update `habitlab/configs.py` — remove unused settings**

Remove these three fields from the `Settings` class:

```python
SECRET_KEY: str = "dev-secret-key-change-in-production"
TRUSTED_EMAIL_HEADER: str = ""
TRUSTED_LOCAL_EMAIL: str = ""
```

Also remove the `is_trusted_env()` method:
```python
def is_trusted_env(self):
    return self.TRUSTED_LOCAL_EMAIL
```

- [ ] **Step 2: Update `habitlab/templates/login.html` — switch to JSON login**

Find the `login()` JS function:
```js
async function login(password) {
    const resp = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'username=admin@beaverhabits.app&password=' + encodeURIComponent(password),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.access_token;
}
```

Replace with:
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

- [ ] **Step 3: Rewrite `habitlab/main.py`**

Replace the entire file with:

```python
# habitlab/main.py
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from habitlab.configs import settings
from habitlab.db import DB_PATH, init_db
from habitlab.logger import logger
from habitlab.migrate import migrate_if_needed
from habitlab.routes.auth import router as auth_router
from habitlab.routes.api import init_api_routes
from habitlab.routes.metrics import init_metrics_routes
from habitlab.routes.pages import init_page_routes

logger.info("Starting HabitLab...")

PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_DIR = PROJECT_ROOT / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.DEBUG:
        logger.info("Debug mode enabled")
    await migrate_if_needed(DB_PATH)
    await init_db()
    yield


app = FastAPI(lifespan=lifespan)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

UPLOADS_DIR = Path(settings.DATA_DIR) / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

init_metrics_routes(app)
app.include_router(auth_router)
init_api_routes(app)
init_page_routes(app)


@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{elapsed_ms:.0f}"
    logger.info(
        "%s %s %d %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response


@app.middleware("http")
async def js_no_cache(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if path.startswith("/static/js/") and path.endswith(".js"):
        response.headers["Cache-Control"] = "no-cache"
    return response
```

- [ ] **Step 4: Run tests**

```bash
uv run pytest tests/ -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add habitlab/configs.py habitlab/templates/login.html habitlab/main.py
git commit -m "feat: update main.py startup, JSON login, drop unused config settings"
```

---

### Task 9: Delete `habitlab/app/`, update deps, final verification

**Files:**
- Delete: `habitlab/app/` (entire directory)
- Modify: `pyproject.toml`

- [ ] **Step 1: Verify nothing in the live codebase still imports from `habitlab.app`**

```bash
grep -r "from habitlab.app\|import habitlab.app" habitlab/ tests/ --include="*.py"
```

Expected: no output. If any results appear, fix those imports before proceeding.

- [ ] **Step 2: Delete `habitlab/app/`**

```bash
git rm -r habitlab/app/
```

- [ ] **Step 3: Update `pyproject.toml` — swap dependencies and confirm pytest asyncio mode**

Remove from `[project] dependencies`:
```toml
"fastapi-users[sqlalchemy]<15.0.0,>=14.0.0",
"sqlalchemy[asyncio]<3.0.0,>=2.0.29",
"asyncpg<1.0.0,>=0.29.0",
```

Add to `[project] dependencies`:
```toml
"pyjwt>=2.8.0",
"passlib[bcrypt]>=1.7.4",
```

Add or confirm this section exists in `pyproject.toml` (required for async fixtures without per-test decorators):
```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
```

- [ ] **Step 4: Sync dependencies**

```bash
uv sync
```

Expected: resolves without errors. Confirm `fastapi-users` is no longer installed:

```bash
uv pip show fastapi-users 2>&1 | head -3
```

Expected: `WARNING: Package(s) not found: fastapi-users`

- [ ] **Step 5: Run the full test suite**

```bash
uv run pytest tests/ -q
```

Expected: all tests pass (62 original + 6 test_db + 6 test_auth_new = 74 tests).

- [ ] **Step 6: Verify app starts**

```bash
uv run uvicorn habitlab.main:app --port 8765 &
sleep 2
curl -s http://localhost:8765/auth/status
kill %1
```

Expected: `{"setup_required":true}` (or `false` if `.user/habits.db` has a migrated password hash).

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml
git commit -m "feat: delete habitlab/app/, remove fastapi-users/sqlalchemy, add pyjwt/passlib"
```
