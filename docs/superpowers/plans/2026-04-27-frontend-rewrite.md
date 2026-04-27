# Frontend Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the NiceGUI-based frontend with a vanilla-JS + Jinja2 frontend that mirrors the Lockbox visual design language, while preserving the existing FastAPI backend (auth, storage, habit business logic, JSON API).

**Architecture:** Single-process FastAPI app. Server renders HTML page shells via Jinja2 (`StaticFiles` for assets). The browser runs ~700 LOC of vanilla JS that calls the existing JSON API at `/api/v1/*` and renders the dynamic UI. No build step. One Docker image.

**Tech Stack:** Python 3.12, FastAPI, fastapi-users (cookie auth), SQLAlchemy async, Jinja2, vanilla JavaScript (ES modules), CSS variables for theming, SortableJS (vendored). Reference design lifted from `github.com/mhamida292/lockbox` (`static/css/styles.css` + `templates/index.html`).

**Reference spec:** `docs/superpowers/specs/2026-04-27-frontend-rewrite-design.md`

---

## Phase 1 — Backend trim

Remove dead code paths before adding new ones. After Phase 1 the app will not run (no UI mounted); that's expected. Phase 6 mounts the new UI.

### Task 1.1: Update `pyproject.toml` dependencies

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Edit dependency list**

Open `pyproject.toml`. In `[project] dependencies`, remove these lines:
```
"nicegui[redis]>=3.0.0",
"loguru>=0.7.3",
"requests>=2.32.4",
"httpx[socks]>=0.28.1",
"highlight-io>=0.9.3",
"uvicorn-worker>=0.3.0",
```

Keep `"jinja2>=3.1.6",` — it's already present.

In `[dependency-groups]`, **delete the entire `fly` group** (sentry, paddle, memray).

In dev dependencies, remove `"pytest-selenium"`, `"webdriver-manager"`, `"selenium"`, `"beautifulsoup4"` (used by NiceGUI tests we're deleting).

Add a new group:
```toml
e2e = [
    "pytest-playwright>=0.5.0",
    "playwright>=1.45.0",
]
```

- [ ] **Step 2: Refresh lockfile**

Run: `uv sync`
Expected: completes without errors. New `uv.lock` reflects changes.

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: drop NiceGUI/Paddle/Sentry/loguru deps, add Playwright dev group"
```

---

### Task 1.2: Delete unused source files

**Files:**
- Delete: `beaverhabits/frontend/` (entire directory)
- Delete: `beaverhabits/views.py`
- Delete: `beaverhabits/scheduler.py`
- Delete: `beaverhabits/accessibility.py`
- Delete: `beaverhabits/logger.py`
- Delete: `beaverhabits/plan/` (entire directory — Paddle)
- Delete: `beaverhabits/routes/routes.py`
- Delete: `beaverhabits/routes/astro.py`
- Delete: `beaverhabits/routes/google_one_tap.py`
- Delete: `beaverhabits/core/backup.py`
- Delete: `tests/test_gui.py` (NiceGUI-specific, replaced by Playwright in Phase 9)

- [ ] **Step 1: Remove the directories and files**

```bash
rm -rf beaverhabits/frontend
rm -rf beaverhabits/plan
rm beaverhabits/views.py beaverhabits/scheduler.py beaverhabits/accessibility.py beaverhabits/logger.py
rm beaverhabits/routes/routes.py beaverhabits/routes/astro.py beaverhabits/routes/google_one_tap.py
rm beaverhabits/core/backup.py
rm tests/test_gui.py
```

- [ ] **Step 2: Verify no other tests reference removed modules**

Run: `grep -rn "from beaverhabits.frontend\|from beaverhabits.views\|from beaverhabits.scheduler\|from beaverhabits.routes.routes\|from beaverhabits.routes.astro\|from beaverhabits.routes.google_one_tap\|from beaverhabits.core.backup\|from beaverhabits.logger\|from beaverhabits.plan\|from beaverhabits.accessibility" tests/ beaverhabits/`
Expected: matches only in `beaverhabits/main.py` (we'll fix this in Task 1.6) and `beaverhabits/routes/api.py` (uses `views.get_user_habit_list` — we'll fix in Task 1.5).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete NiceGUI frontend, Paddle, Telegram backup, OAuth, legacy modules"
```

---

### Task 1.3: Replace `loguru` with stdlib logging

The deleted `beaverhabits/logger.py` wrapped loguru. Several modules still import `from beaverhabits.logger import logger`. Replace with stdlib logging.

**Files:**
- Create: `beaverhabits/logger.py` (thin facade)

- [ ] **Step 1: Create stdlib logger**

```python
# beaverhabits/logger.py
import logging
import os
import sys

_level = os.environ.get("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)

logger = logging.getLogger("beaverhabits")
```

- [ ] **Step 2: Run tests to confirm no import errors**

Run: `uv run pytest tests/test_storage.py tests/test_utils.py -q`
Expected: passes. Other test files may fail because of the API changes coming in Tasks 1.4–1.5; that's OK at this point.

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/logger.py
git commit -m "refactor: replace loguru with stdlib logging facade"
```

---

### Task 1.4: Trim `app/db.py` and `app/crud.py`

Drop `UserIdentityModel` (Paddle) and `UserConfigsModel` (custom CSS) and their CRUD functions.

**Files:**
- Modify: `beaverhabits/app/db.py`
- Modify: `beaverhabits/app/crud.py`

- [ ] **Step 1: Inspect current models**

Run: `grep -n "class .*Model\|class User" beaverhabits/app/db.py`
Confirm `UserIdentityModel` and `UserConfigsModel` are present.

- [ ] **Step 2: Delete the two model classes**

In `beaverhabits/app/db.py`, remove:
- The `class UserIdentityModel(...)` block in its entirety
- The `class UserConfigsModel(...)` block in its entirety
- Any imports they alone needed

Keep: `User`, `HabitListModel`, `UserApiToken` (and their relationships).

- [ ] **Step 3: Delete corresponding CRUD functions**

In `beaverhabits/app/crud.py`, remove every function whose name contains `identity`, `paddle`, `config`, or `css`. Examples (verify the actual names by `grep -n "def .*identity\|def .*paddle\|def .*config\|def .*css" beaverhabits/app/crud.py` first):
- `get_user_identity`, `set_user_identity`, `get_paddle_subscription`, etc.
- `get_user_configs`, `set_user_css`, etc.

- [ ] **Step 4: Run storage and API token tests**

Run: `uv run pytest tests/test_storage.py tests/test_api_tokens.py -q`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/app/db.py beaverhabits/app/crud.py
git commit -m "refactor: drop UserIdentityModel and UserConfigsModel"
```

---

### Task 1.5: Trim `app/auth.py`, `app/users.py`, `app/app.py`, and update `routes/api.py`

Remove registration/reset/OAuth route wiring; keep cookie login/logout. Also remove the `views` import from `routes/api.py` and inline the helper.

**Files:**
- Modify: `beaverhabits/app/app.py`
- Modify: `beaverhabits/app/users.py`
- Modify: `beaverhabits/app/auth.py`
- Modify: `beaverhabits/routes/api.py`

- [ ] **Step 1: Slim `app/app.py` to only login/logout**

Replace the entire body of `init_auth_routes` so only the auth router (login/logout) is registered:

```python
# beaverhabits/app/app.py
from fastapi import FastAPI

from .users import auth_backend, fastapi_users


def init_auth_routes(app: FastAPI) -> None:
    app.include_router(
        fastapi_users.get_auth_router(auth_backend),
        prefix="/auth",
        tags=["auth"],
    )
```

(All `register`, `reset_password`, `verify`, and `users` routers are removed.)

- [ ] **Step 2: Trim `users.py` and `auth.py`**

In `beaverhabits/app/users.py`, remove any callbacks tied to registration verification emails, password reset emails, etc. Keep the `UserManager` class core (`reset_password_token_secret`, `verification_token_secret` can stay as constants — they're cheap), the `auth_backend`, and `fastapi_users`.

In `beaverhabits/app/auth.py`, remove any helpers used only by reset/verify flows.

Run: `grep -rn "REQUIRE_ADMIN_FOR_REGISTRATION\|ADMIN_EMAIL\|reset_password_token_secret\|verification_token_secret" beaverhabits/`
Note remaining references for cleanup but don't break callers in this task.

- [ ] **Step 3: Inline `views.get_user_habit_list` into `routes/api.py`**

The deleted `views.py` had:
```python
async def get_user_habit_list(user) -> HabitList | None:
    # one-line wrapper around storage
```

In `beaverhabits/routes/api.py`, replace `from beaverhabits import views` with the direct storage call. Find the `current_habit_list` dependency:

```python
async def current_habit_list(user: User = Depends(current_active_user)) -> HabitList:
    habit_list = await views.get_user_habit_list(user)
    if not habit_list:
        raise HTTPException(status_code=404, detail="No habits found")
    return habit_list
```

Replace with:
```python
from beaverhabits.app import crud
from beaverhabits.storage import get_user_dict_storage

async def current_habit_list(user: User = Depends(current_active_user)) -> HabitList:
    storage = get_user_dict_storage()
    habit_list = await storage.get_user_habit_list(user)
    if habit_list is None:
        # auto-create empty list on first call so downstream endpoints work
        habit_list = await storage.create_user_habit_list(user)
    return habit_list
```

(Verify the actual storage import path with `grep -n "get_user_dict_storage\|user_storage" beaverhabits/storage/__init__.py beaverhabits/storage/*.py` — adjust if the function name differs.)

Also delete `loguru` import in `routes/api.py` and replace with `from beaverhabits.logger import logger`.

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_apis.py tests/test_api_tokens.py -q`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/app/app.py beaverhabits/app/users.py beaverhabits/app/auth.py beaverhabits/routes/api.py
git commit -m "refactor: trim auth wiring to login/logout only, inline views helper"
```

---

### Task 1.6: Rewrite `main.py` and trim `configs.py`

Replace the NiceGUI mount with `StaticFiles` + `Jinja2Templates`. Drop env vars for removed features.

**Files:**
- Modify: `beaverhabits/main.py`
- Modify: `beaverhabits/configs.py`

- [ ] **Step 1: Trim `configs.py`**

Open `beaverhabits/configs.py`. Remove every setting whose name starts with `PADDLE_`, `TELEGRAM_`, `SENTRY_`, `MEMRAY_`, `GOOGLE_CLIENT_ID`, `HIGHLIGHT_`, plus `ENABLE_PLAN`, `ENABLE_DAILY_BACKUP`, `REQUIRE_ADMIN_FOR_REGISTRATION`, `ADMIN_EMAIL`, `ENABLE_REGISTRATION`, `ENABLE_PASSWORD_RESET`, `RESET_PASSWORD_TOKEN_SECRET`, `VERIFICATION_TOKEN_SECRET`, anything for custom CSS sanitization that's no longer used.

Keep: `SECRET_KEY`, `DATABASE_URL`, `DATA_DIR`, `TIME_ZONE`, `DEFAULT_COMPLETION_STATUS_LIST`, `DEBUG`, plus any pure-business settings (e.g., `MAX_HABITS_PER_USER` if present).

- [ ] **Step 2: Rewrite `main.py`**

Replace the entire file with:

```python
# beaverhabits/main.py
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from beaverhabits.app.app import init_auth_routes
from beaverhabits.app.db import create_db_and_tables
from beaverhabits.configs import settings
from beaverhabits.logger import logger
from beaverhabits.routes.api import init_api_routes
from beaverhabits.routes.metrics import init_metrics_routes
# routes.pages is added in Phase 5 (Task 5.1); imported then.

logger.info("Starting BeaverHabits...")

PROJECT_ROOT = Path(__file__).resolve().parent
STATIC_DIR = PROJECT_ROOT / "static"


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.DEBUG:
        logger.info("Debug mode enabled")
    await create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

init_metrics_routes(app)
init_auth_routes(app)
init_api_routes(app)
# init_page_routes(app) — added in Task 5.1


@app.middleware("http")
async def request_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time"] = f"{elapsed_ms:.0f}"
    logger.info(
        "%s %s %d %.0fms",
        request.method, request.url.path, response.status_code, elapsed_ms,
    )
    return response
```

(`init_page_routes` is wired in Task 5.1 — left commented out for now so backend tests in Phase 2 can still construct the FastAPI app.)

- [ ] **Step 3: Sanity check imports**

Run: `uv run python -c "import beaverhabits.configs; print('configs ok')"`
Expected: prints `configs ok`. (`main.py` will fail to import until Phase 5; ignore for now.)

- [ ] **Step 4: Commit**

```bash
git add beaverhabits/main.py beaverhabits/configs.py
git commit -m "refactor: rewrite main.py for StaticFiles + Jinja, trim configs"
```

---

## Phase 2 — Backend additions

Add new endpoints needed by the frontend. Each task is TDD: failing test → implement → passing test → commit.

### Task 2.1: `/auth/status` endpoint

Returns `{ setup_required: bool, logged_in: bool }`. Used by `/login` template to switch between "setup" and "login" modes.

**Files:**
- Modify: `beaverhabits/app/app.py`
- Test: `tests/test_auth_status.py` (new)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_auth_status.py
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_status_setup_required_when_no_users(client: AsyncClient):
    resp = await client.get("/auth/status")
    assert resp.status_code == 200
    body = resp.json()
    assert body["setup_required"] is True
    assert body["logged_in"] is False


@pytest.mark.asyncio
async def test_status_setup_done_after_user_exists(client: AsyncClient, registered_user):
    # registered_user fixture creates a user via crud
    resp = await client.get("/auth/status")
    body = resp.json()
    assert body["setup_required"] is False
    assert body["logged_in"] is False  # not logged in yet


@pytest.mark.asyncio
async def test_status_logged_in_when_authenticated(authed_client):
    resp = await authed_client.get("/auth/status")
    body = resp.json()
    assert body["logged_in"] is True
```

(Verify `client`, `registered_user`, `authed_client` fixtures exist in `tests/conftest.py`. If not, add: `client` is an `AsyncClient` against the FastAPI app; `registered_user` calls `crud.create_user`; `authed_client` does login first.)

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_auth_status.py -v`
Expected: FAIL — endpoint not registered.

- [ ] **Step 3: Implement**

In `beaverhabits/app/app.py`, after `init_auth_routes` registers the auth router, add:

```python
from sqlalchemy import select, func
from beaverhabits.app.db import User, get_async_session
from fastapi import Depends, Request

async def _setup_required(session) -> bool:
    result = await session.execute(select(func.count()).select_from(User))
    return result.scalar_one() == 0

def init_auth_routes(app: FastAPI) -> None:
    app.include_router(
        fastapi_users.get_auth_router(auth_backend),
        prefix="/auth",
        tags=["auth"],
    )

    @app.get("/auth/status", tags=["auth"])
    async def auth_status(
        request: Request,
        session=Depends(get_async_session),
    ):
        setup_required = await _setup_required(session)
        cookie = request.cookies.get(auth_backend.transport.cookie_name)
        logged_in = bool(cookie)  # presence-only; full validation isn't required for this endpoint
        return {"setup_required": setup_required, "logged_in": logged_in}
```

(Verify `get_async_session` and `auth_backend.transport.cookie_name` exist; adjust to actual names.)

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_auth_status.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/app/app.py tests/test_auth_status.py
git commit -m "feat(auth): add /auth/status endpoint"
```

---

### Task 2.2: `/auth/setup` endpoint (first-run create master password)

**Files:**
- Modify: `beaverhabits/app/app.py`
- Test: `tests/test_auth_setup.py` (new)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_auth_setup.py
import pytest


@pytest.mark.asyncio
async def test_setup_creates_user_with_admin_email(client):
    resp = await client.post("/auth/setup", json={"password": "abc12345"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "admin@local"


@pytest.mark.asyncio
async def test_setup_refuses_when_user_exists(client, registered_user):
    resp = await client.post("/auth/setup", json={"password": "newpass1234"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_setup_rejects_short_password(client):
    resp = await client.post("/auth/setup", json={"password": "abc"})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_setup_logs_user_in_via_cookie(client):
    resp = await client.post("/auth/setup", json={"password": "abc12345"})
    assert resp.status_code == 200
    cookie_name = "beaverhabits"  # adjust to actual transport.cookie_name if different
    assert any(c.name.startswith("beaverhabits") for c in client.cookies.jar)
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_auth_setup.py -v`
Expected: FAIL — endpoint not registered.

- [ ] **Step 3: Implement**

Add to `beaverhabits/app/app.py` (next to `auth_status`):

```python
from pydantic import BaseModel, Field
from fastapi import HTTPException
from beaverhabits.app.users import UserManager, get_user_manager
from beaverhabits.app.schemas import UserCreate

class SetupBody(BaseModel):
    password: str = Field(min_length=8, max_length=128)

@app.post("/auth/setup", tags=["auth"])
async def auth_setup(
    body: SetupBody,
    session=Depends(get_async_session),
    user_manager: UserManager = Depends(get_user_manager),
):
    if not await _setup_required(session):
        raise HTTPException(status_code=409, detail="Setup already completed")
    create = UserCreate(email="admin@local", password=body.password)
    user = await user_manager.create(create, safe=True)
    return {"id": str(user.id), "email": user.email}
```

(If `safe=True` is rejected by the user manager because of registration being disabled, switch to `await user_manager.create(create)` directly.)

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_auth_setup.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/app/app.py tests/test_auth_setup.py
git commit -m "feat(auth): add /auth/setup endpoint for first-run master password"
```

---

### Task 2.3: `/auth/change-password` endpoint

**Files:**
- Modify: `beaverhabits/app/app.py`
- Test: `tests/test_change_password.py` (new)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_change_password.py
import pytest


@pytest.mark.asyncio
async def test_change_password_requires_auth(client):
    resp = await client.post(
        "/auth/change-password",
        json={"current_password": "x", "new_password": "y"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_current(authed_client):
    resp = await authed_client.post(
        "/auth/change-password",
        json={"current_password": "wrong", "new_password": "newvalidpass"},
    )
    assert resp.status_code == 400


@pytest.mark.asyncio
async def test_change_password_succeeds_and_logs_in_with_new(client, registered_user):
    # registered_user fixture sets password "testpass1234"
    login = await client.post(
        "/auth/login",
        data={"username": "admin@local", "password": "testpass1234"},
    )
    assert login.status_code == 204

    resp = await client.post(
        "/auth/change-password",
        json={"current_password": "testpass1234", "new_password": "newpass5678"},
    )
    assert resp.status_code == 204

    # Old password rejected
    bad = await client.post(
        "/auth/login",
        data={"username": "admin@local", "password": "testpass1234"},
    )
    assert bad.status_code == 400

    # New password works
    good = await client.post(
        "/auth/login",
        data={"username": "admin@local", "password": "newpass5678"},
    )
    assert good.status_code == 204
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_change_password.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `beaverhabits/app/app.py`:

```python
from beaverhabits.app.dependencies import current_active_user
from beaverhabits.app.db import User
from fastapi import Response

class ChangePasswordBody(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

@app.post("/auth/change-password", tags=["auth"], status_code=204)
async def change_password(
    body: ChangePasswordBody,
    user: User = Depends(current_active_user),
    user_manager: UserManager = Depends(get_user_manager),
):
    valid, _ = await user_manager.password_helper.verify_and_update(
        body.current_password, user.hashed_password
    )
    if not valid:
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    user.hashed_password = user_manager.password_helper.hash(body.new_password)
    await user_manager.user_db.update(user, {"hashed_password": user.hashed_password})
    return Response(status_code=204)
```

(Adjust the password-helper API to whatever fastapi-users exposes — verify by `grep -n "password_helper\|verify_and_update" .venv/lib/*/site-packages/fastapi_users/`.)

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_change_password.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/app/app.py tests/test_change_password.py
git commit -m "feat(auth): add /auth/change-password endpoint"
```

---

### Task 2.4: `/api/v1/habits/{id}/stats` endpoint

Returns streak / total / 30-day / 90-day percentages.

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_habit_stats.py` (new)

- [ ] **Step 1: Write failing test**

```python
# tests/test_habit_stats.py
import pytest
import datetime


@pytest.mark.asyncio
async def test_stats_for_habit_with_no_records(authed_client, habit):
    resp = await authed_client.get(f"/api/v1/habits/{habit.id}/stats")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"streak": 0, "total": 0, "percent_30d": 0.0, "percent_90d": 0.0}


@pytest.mark.asyncio
async def test_stats_counts_completions(authed_client, habit_with_5_recent_completions):
    habit = habit_with_5_recent_completions
    resp = await authed_client.get(f"/api/v1/habits/{habit.id}/stats")
    body = resp.json()
    assert body["total"] == 5
    assert body["streak"] >= 1
    assert 0 <= body["percent_30d"] <= 100
```

(Add `habit` and `habit_with_5_recent_completions` fixtures to `tests/conftest.py` — they create a habit and optionally insert completions for the past N days.)

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_habit_stats.py -v`
Expected: FAIL — endpoint missing.

- [ ] **Step 3: Implement**

In `beaverhabits/routes/api.py`:

```python
import datetime
from beaverhabits.core.completions import CStatus, get_habit_date_completion

@api_router.get("/habits/{habit_id}/stats", tags=["habits"])
async def get_habit_stats(
    habit_id: str,
    habit_list: HabitList = Depends(current_habit_list),
):
    habit = await habit_list.get_habit_by(habit_id)
    if habit is None:
        raise HTTPException(status_code=404)

    today = datetime.date.today()
    records = list(habit.records)
    done_dates = sorted(
        (r.day for r in records if r.done),
        reverse=True,
    )

    # streak: consecutive days backward from today
    streak = 0
    cursor = today
    done_set = set(done_dates)
    while cursor in done_set:
        streak += 1
        cursor -= datetime.timedelta(days=1)

    def percent(window_days: int) -> float:
        cutoff = today - datetime.timedelta(days=window_days)
        hits = sum(1 for d in done_dates if cutoff <= d <= today)
        return round(hits / window_days * 100, 1)

    return {
        "streak": streak,
        "total": len(done_dates),
        "percent_30d": percent(30),
        "percent_90d": percent(90),
    }
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_habit_stats.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_habit_stats.py tests/conftest.py
git commit -m "feat(api): add /api/v1/habits/{id}/stats endpoint"
```

---

### Task 2.5: `/api/v1/habits/{id}/heatmap` endpoint

Returns pre-computed grid for the multi-year view.

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_habit_heatmap.py` (new)

- [ ] **Step 1: Write failing test**

```python
# tests/test_habit_heatmap.py
import pytest
import datetime


@pytest.mark.asyncio
async def test_heatmap_returns_year_buckets(authed_client, habit):
    resp = await authed_client.get(f"/api/v1/habits/{habit.id}/heatmap?years=2")
    assert resp.status_code == 200
    body = resp.json()
    assert "years" in body
    assert len(body["years"]) == 2
    assert body["years"][0]["year"] == datetime.date.today().year
    assert "days" in body["years"][0]
    assert isinstance(body["years"][0]["days"], list)


@pytest.mark.asyncio
async def test_heatmap_clamps_years_to_max(authed_client, habit):
    resp = await authed_client.get(f"/api/v1/habits/{habit.id}/heatmap?years=99")
    body = resp.json()
    assert len(body["years"]) <= 10  # arbitrary safety cap
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_habit_heatmap.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `beaverhabits/routes/api.py`:

```python
@api_router.get("/habits/{habit_id}/heatmap", tags=["habits"])
async def get_habit_heatmap(
    habit_id: str,
    years: int = Query(1, ge=1, le=10),
    habit_list: HabitList = Depends(current_habit_list),
):
    habit = await habit_list.get_habit_by(habit_id)
    if habit is None:
        raise HTTPException(status_code=404)

    today = datetime.date.today()
    done_set = {r.day for r in habit.records if r.done}

    out_years = []
    for offset in range(years):
        year = today.year - offset
        first = datetime.date(year, 1, 1)
        last = datetime.date(year, 12, 31)
        days = []
        cursor = first
        while cursor <= last:
            days.append({
                "date": cursor.isoformat(),
                "done": cursor in done_set,
            })
            cursor += datetime.timedelta(days=1)
        out_years.append({"year": year, "days": days})

    return {"years": out_years}
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_habit_heatmap.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_habit_heatmap.py
git commit -m "feat(api): add /api/v1/habits/{id}/heatmap endpoint"
```

---

### Task 2.6: `/api/v1/uploads` endpoint (image upload for notes)

Accepts a multipart file, saves under `${DATA_DIR}/uploads/<uuid>.<ext>`, returns `{ url }`.

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Modify: `beaverhabits/main.py` (mount `/uploads` as StaticFiles)
- Test: `tests/test_uploads.py` (new)

- [ ] **Step 1: Write failing test**

```python
# tests/test_uploads.py
import io
import pytest


@pytest.mark.asyncio
async def test_upload_requires_auth(client):
    resp = await client.post(
        "/api/v1/uploads",
        files={"file": ("test.png", io.BytesIO(b"fake"), "image/png")},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_upload_rejects_non_image(authed_client):
    resp = await authed_client.post(
        "/api/v1/uploads",
        files={"file": ("test.txt", io.BytesIO(b"hi"), "text/plain")},
    )
    assert resp.status_code == 415


@pytest.mark.asyncio
async def test_upload_returns_url(authed_client):
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    resp = await authed_client.post(
        "/api/v1/uploads",
        files={"file": ("a.png", io.BytesIO(png), "image/png")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["url"].startswith("/uploads/")
    assert body["url"].endswith(".png")


@pytest.mark.asyncio
async def test_upload_rejects_oversized(authed_client):
    big = b"\x89PNG\r\n\x1a\n" + b"\x00" * (6 * 1024 * 1024)
    resp = await authed_client.post(
        "/api/v1/uploads",
        files={"file": ("big.png", io.BytesIO(big), "image/png")},
    )
    assert resp.status_code == 413
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_uploads.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `beaverhabits/routes/api.py`:

```python
import uuid
from pathlib import Path
from fastapi import UploadFile, File
from beaverhabits.configs import settings

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB

@api_router.post("/uploads", tags=["uploads"])
async def post_upload(
    file: UploadFile = File(...),
    user: User = Depends(current_active_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported file type")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = ext_map[file.content_type]
    name = f"{uuid.uuid4().hex}{ext}"
    upload_dir = Path(settings.DATA_DIR) / "uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)
    (upload_dir / name).write_bytes(contents)
    return {"url": f"/uploads/{name}"}
```

In `beaverhabits/main.py`, after the existing `app.mount("/static", ...)`:
```python
UPLOADS_DIR = Path(settings.DATA_DIR) / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")
```

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_uploads.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py beaverhabits/main.py tests/test_uploads.py
git commit -m "feat(api): add /api/v1/uploads endpoint for note images"
```

---

### Task 2.7: `/api/v1/tokens` GET/POST/DELETE endpoints

Existing CRUD in `app/crud.py` already supports user API tokens (Task 1.4 kept them). Wire up REST endpoints.

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: extend `tests/test_api_tokens.py`

- [ ] **Step 1: Add tests**

```python
# add to tests/test_api_tokens.py

@pytest.mark.asyncio
async def test_get_tokens_returns_null_when_none(authed_client):
    resp = await authed_client.get("/api/v1/tokens")
    assert resp.status_code == 200
    assert resp.json() == {"token": None}


@pytest.mark.asyncio
async def test_create_then_get_then_delete_token(authed_client):
    create = await authed_client.post("/api/v1/tokens")
    assert create.status_code == 200
    token = create.json()["token"]
    assert isinstance(token, str) and len(token) > 16

    get = await authed_client.get("/api/v1/tokens")
    assert get.json()["token"] == token

    delete = await authed_client.delete("/api/v1/tokens")
    assert delete.status_code == 204

    after = await authed_client.get("/api/v1/tokens")
    assert after.json() == {"token": None}
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_api_tokens.py -v`
Expected: new tests FAIL.

- [ ] **Step 3: Implement**

In `beaverhabits/routes/api.py`:

```python
from beaverhabits.app import crud as auth_crud

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

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_api_tokens.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_api_tokens.py
git commit -m "feat(api): add /api/v1/tokens REST endpoints"
```

---

### Task 2.8: `/api/v1/export` and `/api/v1/import` endpoints

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_export_import.py` (new)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_export_import.py
import pytest
import json


@pytest.mark.asyncio
async def test_export_round_trips_with_import(authed_client, habit):
    exported = await authed_client.get("/api/v1/export")
    assert exported.status_code == 200
    payload = exported.json()
    assert "habits" in payload

    delete = await authed_client.delete(f"/api/v1/habits/{habit.id}")
    assert delete.status_code in (200, 204)

    imported = await authed_client.post("/api/v1/import", json=payload)
    assert imported.status_code == 200

    listing = await authed_client.get("/api/v1/habits")
    names = [h["name"] for h in listing.json()]
    assert habit.name in names
```

- [ ] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_export_import.py -v`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `beaverhabits/routes/api.py`:

```python
@api_router.get("/export", tags=["data"])
async def export_data(habit_list: HabitList = Depends(current_habit_list)):
    return await habit_list.serialize()  # use existing storage method; adjust to actual API

@api_router.post("/import", tags=["data"])
async def import_data(
    payload: dict,
    habit_list: HabitList = Depends(current_habit_list),
):
    await habit_list.merge(payload)  # adjust to actual storage API
    return {"ok": True}
```

(Verify the actual `serialize`/`merge` method names by `grep -n "def .*serialize\|def .*merge\|def .*to_dict" beaverhabits/storage/*.py`. If the existing storage uses `to_dict`/`from_dict`, swap accordingly.)

- [ ] **Step 4: Run tests**

Run: `uv run pytest tests/test_export_import.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_export_import.py
git commit -m "feat(api): add /api/v1/export and /api/v1/import endpoints"
```

---

## Phase 3 — Static assets foundation

Lift Lockbox CSS, add fonts/PWA assets. No JS yet — Phase 6.

### Task 3.1: Lift Lockbox CSS, scope to two themes, drop unused selectors

**Files:**
- Create: `beaverhabits/static/css/styles.css`

- [ ] **Step 1: Copy Lockbox CSS as starting point**

Source: `https://github.com/mhamida292/lockbox/blob/main/static/css/styles.css`

Use `gh api repos/mhamida292/lockbox/contents/static/css/styles.css --jq '.content' | base64 -d > beaverhabits/static/css/styles.css` from a unix-like shell, or copy the content from your local clone.

- [ ] **Step 2: Trim themes to two**

In `styles.css`, delete the `[data-theme]` blocks for `ember`, `moss`, `sakura`, `slate`, `amethyst`, `lavender`. Keep only `midnight` and `arctic`.

- [ ] **Step 3: Delete password-vault-specific selectors**

Remove rules for `.auth-hex`, `.s-brand` logo image, `.ecopy-user/.ecopy-pass/.ecopy-url/.ecopy-note`, `.fdel/.fedit` (folder edit/delete), `.icon-picker`, `.color-picker`, `.pw-strength*`, `.color-opt`, anything with `.bgen` (password generator).

- [ ] **Step 4: Add habit-tracker primitives**

Append the following section to `styles.css`:

```css
/* ── Habit grid ────────────────────────────────────────────── */
.hgrid { padding: 8px; flex: 1; overflow-y: auto; }
.hrow {
    display: flex; align-items: center; gap: 13px; padding: 13px 14px;
    border-radius: var(--r); cursor: pointer; transition: all .12s;
    border: 1px solid transparent; border-left: 3px solid transparent;
}
.hrow:hover { background: var(--card-hover); border-color: var(--border); border-left-color: var(--accent); }
.hicon {
    width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
    background: var(--surface2); border: 1px solid var(--border);
}
.hname { flex: 1; min-width: 0; font-size: 14px; }
.hchecks { display: flex; gap: 4px; flex-shrink: 0; }
.hchk {
    width: 26px; height: 26px; border-radius: 6px;
    border: 1px solid var(--border); background: transparent;
    cursor: pointer; transition: all .15s;
    display: flex; align-items: center; justify-content: center;
}
.hchk:hover { border-color: var(--accent); }
.hchk[data-status="yes"]  { background: var(--success); border-color: var(--success); }
.hchk[data-status="no"]   { background: color-mix(in srgb, var(--danger) 18%, transparent); border-color: var(--danger); }
.hchk[data-status="skip"] { background: color-mix(in srgb, #f59e0b 18%, transparent); border-color: #f59e0b; }
.hchk svg { width: 16px; height: 16px; color: #fff; }

.hday-label {
    font-size: 9px; letter-spacing: 2px; color: var(--text-muted);
    text-transform: uppercase; padding: 6px 14px;
    display: flex; gap: calc(26px + 4px); padding-left: 67px;
}

/* ── Stat cards ────────────────────────────────────────────── */
.stats-row { display: flex; gap: 10px; margin: 14px 0; }
.stat-card {
    flex: 1; padding: 10px 12px;
    border: 1px solid var(--border); border-radius: 8px;
    background: var(--surface);
}
.stat-num { font-size: 18px; font-weight: 700; color: var(--accent); }
.stat-lbl {
    font-size: 9px; letter-spacing: 1.5px; color: var(--text-muted);
    text-transform: uppercase; margin-top: 2px;
}

/* ── Heatmap ───────────────────────────────────────────────── */
.heatmap { display: grid; grid-template-columns: repeat(26, 1fr); gap: 2px; }
.heatmap.year { grid-template-columns: repeat(53, 1fr); }
.hm-cell {
    aspect-ratio: 1; border-radius: 2px; background: var(--surface2);
}
.hm-cell.l1 { background: color-mix(in srgb, var(--accent) 25%, var(--surface2)); }
.hm-cell.l2 { background: color-mix(in srgb, var(--accent) 50%, var(--surface2)); }
.hm-cell.l3 { background: color-mix(in srgb, var(--accent) 75%, var(--surface2)); }
.hm-cell.l4 { background: var(--accent); }

/* ── Inline-expand habit edit ──────────────────────────────── */
.hrow.expanded {
    padding: 0; cursor: default;
    border: 1.5px solid var(--accent); background: var(--surface);
    border-radius: var(--rl);
    animation: expandIn .25s ease both;
}
.hrow.expanded:hover { background: var(--surface); }
.hef-form { padding: 18px 18px 14px; }
.hef-field { margin-bottom: 14px; }
.hef-actions {
    display: flex; justify-content: space-between; align-items: center;
    padding-top: 14px; margin-top: 14px; border-top: 1px solid var(--border);
}

/* ── Mobile heatmap collapse ───────────────────────────────── */
@media (max-width: 640px) {
    .heatmap.year { grid-template-columns: repeat(26, 1fr); }
}
```

- [ ] **Step 5: Verify file is valid CSS**

Run: `uv run python -c "open('beaverhabits/static/css/styles.css').read()" && echo "ok"`
Expected: `ok`. (For a real lint, install `csslint` separately, but we trust the lifted source.)

- [ ] **Step 6: Commit**

```bash
git add beaverhabits/static/css/styles.css
git commit -m "feat(static): add Lockbox-derived stylesheet with two themes"
```

---

### Task 3.2: PWA manifest + favicon + apple-touch-icon

**Files:**
- Create: `beaverhabits/static/manifest.json`
- Create: `beaverhabits/static/favicon.svg`
- Create: `beaverhabits/static/apple-touch-icon.png` (placeholder — copy existing one if available)

- [ ] **Step 1: Write manifest**

```json
{
  "name": "BeaverHabits",
  "short_name": "Habits",
  "description": "Self-hosted habit tracker",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#07080a",
  "theme_color": "#07080a",
  "icons": [
    { "src": "/static/icon-192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/static/icon-512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
```

- [ ] **Step 2: Add favicon.svg**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#6c8cff">
  <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.18L18.18 8 12 11.82 5.82 8 12 4.18z"/>
</svg>
```

- [ ] **Step 3: Copy or generate PNG icons**

If the current repo has icons under `beaverhabits/static/` or similar paths, copy `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` into `beaverhabits/static/`. Otherwise generate from the SVG using any tool you have (e.g., `inkscape`, `rsvg-convert`, an online SVG-to-PNG converter); the placeholder isn't blocking subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add beaverhabits/static/manifest.json beaverhabits/static/favicon.svg beaverhabits/static/icon-*.png beaverhabits/static/apple-touch-icon.png
git commit -m "feat(static): add PWA manifest and icons"
```

---

### Task 3.3: Vendor SortableJS

**Files:**
- Create: `beaverhabits/static/vendor/sortable.min.js`

- [ ] **Step 1: Download**

```bash
curl -L https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js -o beaverhabits/static/vendor/sortable.min.js
```

- [ ] **Step 2: Verify file exists and is non-empty**

Run: `wc -c beaverhabits/static/vendor/sortable.min.js`
Expected: ~46000 bytes.

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/static/vendor/sortable.min.js
git commit -m "feat(static): vendor SortableJS for drag-to-reorder"
```

---

## Phase 4 — Templates

Create the Jinja2 templates. Pages render shells; dynamic content is hydrated by JS in Phase 6.

### Task 4.1: `base.html` shell

**Files:**
- Create: `beaverhabits/templates/base.html`

- [ ] **Step 1: Write template**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>{% block title %}BeaverHabits{% endblock %}</title>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link rel="apple-touch-icon" href="/static/apple-touch-icon.png">
<link rel="manifest" href="/static/manifest.json">
<meta name="theme-color" content="#07080a">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/styles.css">
<script>
    // Apply theme before paint to avoid flash.
    (function () {
        var saved = localStorage.getItem('theme') || 'midnight';
        document.documentElement.setAttribute('data-theme', saved);
        document.body && document.body.setAttribute('data-theme', saved);
    })();
</script>
</head>
<body data-theme="midnight">

<div class="shade" id="shade" onclick="closeSidebar()"></div>

<div class="app active">
    <aside class="sidebar" id="sidebar">
        <div class="s-head">
            <div class="s-brand">⬡ BeaverHabits</div>
            <div class="s-actions">
                <button class="ibtn" id="themeToggle" title="Toggle theme">☾</button>
                <button class="ibtn" onclick="openSettings()" title="Settings">⚙</button>
                <button class="ibtn dng" onclick="logout()" title="Lock">🔒</button>
            </div>
        </div>
        {% block sidebar %}{% endblock %}
    </aside>

    <div class="main">
        <div class="toolbar">
            <button class="mmenu" onclick="openSidebar()">☰</button>
            {% block toolbar %}{% endblock %}
        </div>
        {% block content %}{% endblock %}
    </div>
</div>

{% include "_settings_modal.html" ignore missing %}
{% include "_note_modal.html" ignore missing %}

<div class="toast" id="toast"></div>

<script type="module" src="/static/js/api.js"></script>
<script type="module" src="/static/js/app.js"></script>
{% block scripts %}{% endblock %}
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/templates/base.html
git commit -m "feat(templates): add base.html shell"
```

---

### Task 4.2: `login.html` template

**Files:**
- Create: `beaverhabits/templates/login.html`

- [ ] **Step 1: Write template**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>{% if setup_required %}Setup{% else %}Login{% endif %} · BeaverHabits</title>
<link rel="icon" type="image/svg+xml" href="/static/favicon.svg">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/styles.css">
<script>
    var saved = localStorage.getItem('theme') || 'midnight';
    document.documentElement.setAttribute('data-theme', saved);
</script>
</head>
<body data-theme="midnight">

<div class="auth-screen">
    <div class="auth-bg"></div>
    <div class="auth-box">
        <div class="auth-hex">⬡</div>
        <div class="auth-logo">BeaverHabits</div>
        <div class="auth-sub">
            {% if setup_required %}Create your master password{% else %}Enter master password{% endif %}
        </div>

        <form id="authForm">
            <div class="auth-field">
                <input type="password" id="passwordIn" placeholder="Master password" autofocus required minlength="8">
            </div>
            {% if setup_required %}
            <div class="auth-field">
                <input type="password" id="confirmIn" placeholder="Confirm password" required minlength="8">
            </div>
            {% endif %}
            <button type="submit" class="auth-btn">
                {% if setup_required %}Create Vault{% else %}Unlock{% endif %}
            </button>
        </form>
        <div class="auth-error" id="authErr"></div>
    </div>
</div>

<script>
    var setupRequired = {{ 'true' if setup_required else 'false' }};
    document.getElementById('authForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var pw = document.getElementById('passwordIn').value;
        var err = document.getElementById('authErr');
        err.textContent = '';

        if (setupRequired) {
            var confirm = document.getElementById('confirmIn').value;
            if (pw !== confirm) { err.textContent = 'Passwords do not match'; return; }
            var resp = await fetch('/auth/setup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
            });
            if (!resp.ok) { err.textContent = (await resp.json()).detail || 'Setup failed'; return; }
            // Auto-login after setup
            await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'username=admin@local&password=' + encodeURIComponent(pw),
            });
        } else {
            var resp = await fetch('/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'username=admin@local&password=' + encodeURIComponent(pw),
            });
            if (!resp.ok) { err.textContent = 'Wrong password'; return; }
        }
        window.location.href = '/';
    });
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/templates/login.html
git commit -m "feat(templates): add login.html with setup-or-login mode"
```

---

### Task 4.3: `index.html` template

**Files:**
- Create: `beaverhabits/templates/index.html`

- [ ] **Step 1: Write template**

```html
{% extends "base.html" %}
{% block title %}Habits · BeaverHabits{% endblock %}

{% block sidebar %}
<div class="s-label">View</div>
<div class="type-filters">
    <button class="tbtn on" data-filter="all">All</button>
    <button class="tbtn" data-filter="daily">Daily</button>
    <button class="tbtn" data-filter="weekly">Weekly</button>
</div>
<div class="s-label">Tags</div>
<ul class="flist" id="tagList"></ul>
<div class="fi-trash" style="margin-top:auto;padding:9px 20px;font-size:13px;color:var(--text-dim);cursor:pointer;border-top:1px solid var(--border)" onclick="window.location='/stats'">📊 Stats</div>
{% endblock %}

{% block toolbar %}
<div class="sbox">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
    <input class="sinput" id="searchIn" placeholder="Search habits...">
</div>
<select class="sort-sel" id="sortSel">
    <option value="manual">Manual</option>
    <option value="updated">Recently active</option>
    <option value="az">A → Z</option>
</select>
<button class="btn-new" id="addBtn">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>
    <span class="newlbl">Add</span>
</button>
{% endblock %}

{% block content %}
<div class="hday-label" id="dayLabels"></div>
<div class="hgrid" id="hgrid"></div>
{% include "_habit_form_template.html" %}
{% endblock %}

{% block scripts %}
<script type="module" src="/static/js/heatmap.js"></script>
<script type="module" src="/static/js/notes.js"></script>
<script type="module" src="/static/js/habits.js"></script>
<script src="/static/vendor/sortable.min.js"></script>
{% endblock %}
```

- [ ] **Step 2: Create the habit-form partial**

```html
<!-- beaverhabits/templates/_habit_form_template.html -->
<template id="habitFormTemplate">
    <div class="hef-form">
        <div class="hef-field">
            <label class="fl">Name</label>
            <input class="finp" name="name" maxlength="80" required>
        </div>
        <div class="hef-field">
            <label class="fl">Frequency</label>
            <select class="fsel" name="frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
            </select>
        </div>
        <div class="hef-field">
            <label class="fl">Tags (comma-separated)</label>
            <input class="finp" name="tags" placeholder="health, learning">
        </div>
        <div class="hef-field">
            <label class="fl">Completion chips (comma-separated)</label>
            <input class="finp" name="chips" placeholder="yes, no, skip">
        </div>
        <div class="hef-actions">
            <button type="button" class="bdng" data-action="delete">Delete</button>
            <div style="display:flex;gap:8px">
                <button type="button" class="bgho" data-action="cancel">Cancel</button>
                <button type="button" class="bpri" data-action="save">Save</button>
            </div>
        </div>
    </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/templates/index.html beaverhabits/templates/_habit_form_template.html
git commit -m "feat(templates): add index.html and habit-form partial"
```

---

### Task 4.4: `habit_detail.html`, `heatmap.html`, `stats.html`

**Files:**
- Create: `beaverhabits/templates/habit_detail.html`
- Create: `beaverhabits/templates/heatmap.html`
- Create: `beaverhabits/templates/stats.html`

- [ ] **Step 1: Write `habit_detail.html`**

```html
{% extends "base.html" %}
{% block title %}{{ habit.name }} · BeaverHabits{% endblock %}

{% block sidebar %}
<div class="s-label">Navigation</div>
<ul class="flist">
    <li class="fi-item" onclick="window.location='/'"><div class="fn">← Back to all habits</div></li>
    <li class="fi-item" onclick="window.location='/heatmap/{{ habit.id }}'"><div class="fn">Multi-year heatmap</div></li>
</ul>
{% endblock %}

{% block content %}
<div style="padding:16px" id="detailRoot" data-habit-id="{{ habit.id }}">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div class="hicon" id="dIcon">📌</div>
        <div style="flex:1">
            <div id="dName" style="font-size:16px;font-weight:700"></div>
            <div id="dMeta" style="font-size:11px;color:var(--text-muted)"></div>
        </div>
        <button class="bgho" id="dEditBtn">Edit</button>
    </div>

    <div class="stats-row" id="dStats">
        <div class="stat-card"><div class="stat-num" id="dStreak">—</div><div class="stat-lbl">Streak</div></div>
        <div class="stat-card"><div class="stat-num" id="d30">—</div><div class="stat-lbl">30-day</div></div>
        <div class="stat-card"><div class="stat-num" id="dTotal">—</div><div class="stat-lbl">Total</div></div>
    </div>

    <div class="ss-title" style="margin-top:18px">Past 26 weeks</div>
    <div class="heatmap" id="dHeatmap"></div>

    <div class="ss-title" style="margin-top:18px">Notes</div>
    <ul id="dNotes" style="list-style:none;padding:0"></ul>
</div>
{% endblock %}

{% block scripts %}
<script type="module" src="/static/js/heatmap.js"></script>
<script type="module" src="/static/js/notes.js"></script>
<script type="module" src="/static/js/habits.js"></script>
<script type="module">
    import { renderHabitDetail } from '/static/js/habits.js';
    renderHabitDetail();
</script>
{% endblock %}
```

- [ ] **Step 2: Write `heatmap.html`**

```html
{% extends "base.html" %}
{% block title %}{{ habit.name }} multi-year · BeaverHabits{% endblock %}

{% block sidebar %}
<div class="s-label">Navigation</div>
<ul class="flist">
    <li class="fi-item" onclick="window.location='/habits/{{ habit.id }}'"><div class="fn">← Back to habit</div></li>
</ul>
{% endblock %}

{% block content %}
<div style="padding:16px" id="multiYearRoot" data-habit-id="{{ habit.id }}">
    <h1 style="font-size:18px;margin-bottom:14px">{{ habit.name }}</h1>
    <div id="yearsContainer"></div>
</div>
{% endblock %}

{% block scripts %}
<script type="module">
    import { renderMultiYearHeatmap } from '/static/js/heatmap.js';
    renderMultiYearHeatmap();
</script>
{% endblock %}
```

- [ ] **Step 3: Write `stats.html`**

```html
{% extends "base.html" %}
{% block title %}Stats · BeaverHabits{% endblock %}

{% block sidebar %}
<div class="s-label">Navigation</div>
<ul class="flist">
    <li class="fi-item" onclick="window.location='/'"><div class="fn">← Back to habits</div></li>
</ul>
{% endblock %}

{% block content %}
<div style="padding:16px">
    <h1 style="font-size:18px;margin-bottom:14px">Overall stats</h1>
    <div id="statsRoot">Loading…</div>
</div>
{% endblock %}

{% block scripts %}
<script type="module">
    import { api } from '/static/js/api.js';
    const root = document.getElementById('statsRoot');
    api.get('/api/v1/habits').then(habits => {
        root.innerHTML = `<p style="color:var(--text-dim)">${habits.length} active habit${habits.length !== 1 ? 's' : ''}.</p>`;
    });
</script>
{% endblock %}
```

- [ ] **Step 4: Commit**

```bash
git add beaverhabits/templates/habit_detail.html beaverhabits/templates/heatmap.html beaverhabits/templates/stats.html
git commit -m "feat(templates): add habit_detail, heatmap, stats templates"
```

---

### Task 4.5: Settings and note modal partials

**Files:**
- Create: `beaverhabits/templates/_settings_modal.html`
- Create: `beaverhabits/templates/_note_modal.html`

- [ ] **Step 1: Settings modal**

```html
<!-- beaverhabits/templates/_settings_modal.html -->
<div class="ov" id="settingsOv">
    <div class="modal">
        <div class="mh">
            <div class="mt">Settings</div>
            <button class="mx" onclick="closeSettings()">&times;</button>
        </div>
        <div class="mb">

            <div class="ss-section">
                <div class="ss-title">Theme</div>
                <div class="srow">
                    <div><div class="slabel">Dark mode</div><div class="sdesc">Use the midnight theme</div></div>
                    <select id="setThemeSel">
                        <option value="midnight">Midnight (dark)</option>
                        <option value="arctic">Arctic (light)</option>
                    </select>
                </div>
            </div>

            <div class="ss-section">
                <div class="ss-title">Master password</div>
                <div class="fg"><label class="fl">Current</label><input class="finp" type="password" id="cpCurrent"></div>
                <div class="fg"><label class="fl">New</label><input class="finp" type="password" id="cpNew" minlength="8"></div>
                <button class="bpri" id="cpSubmit">Change password</button>
            </div>

            <div class="ss-section">
                <div class="ss-title">Default chips</div>
                <input class="finp" id="setDefaultChips" placeholder="yes, no, skip">
                <div class="cwarn" style="margin-top:6px">Comma-separated. Used when creating new habits.</div>
            </div>

            <div class="ss-section">
                <div class="ss-title">Data</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                    <button class="bpri" id="exportBtn" style="width:100%">Export JSON</button>
                    <button class="bgho" id="importBtn" style="width:100%">Import JSON</button>
                    <input type="file" id="importFile" accept="application/json" style="display:none">
                </div>
            </div>

            <div class="ss-section">
                <div class="ss-title">API token</div>
                <div id="tokenView">Loading…</div>
            </div>

        </div>
    </div>
</div>
```

- [ ] **Step 2: Note modal**

```html
<!-- beaverhabits/templates/_note_modal.html -->
<div class="ov" id="noteOv">
    <div class="modal">
        <div class="mh">
            <div class="mt">Note</div>
            <button class="mx" onclick="closeNote()">&times;</button>
        </div>
        <div class="mb">
            <div class="fg">
                <label class="fl">Date</label>
                <input class="finp" id="noteDate" readonly>
            </div>
            <div class="fg">
                <label class="fl">Note</label>
                <textarea class="fta" id="noteText" placeholder="What happened…"></textarea>
            </div>
            <div class="fg">
                <label class="fl">Image (optional)</label>
                <input type="file" id="noteImage" accept="image/png,image/jpeg,image/webp,image/gif">
                <div id="noteImagePreview" style="margin-top:8px"></div>
            </div>
        </div>
        <div class="mf">
            <button class="bdng" id="noteDelete">Delete</button>
            <div style="display:flex;gap:8px">
                <button class="bgho" onclick="closeNote()">Cancel</button>
                <button class="bpri" id="noteSave">Save</button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add beaverhabits/templates/_settings_modal.html beaverhabits/templates/_note_modal.html
git commit -m "feat(templates): add settings and note modal partials"
```

---

## Phase 5 — Page routes

### Task 5.1: Create `routes/pages.py`

**Files:**
- Create: `beaverhabits/routes/pages.py`

- [ ] **Step 1: Implement page routes**

```python
# beaverhabits/routes/pages.py
from pathlib import Path

from fastapi import FastAPI, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import select, func

from beaverhabits.app.db import User, get_async_session
from beaverhabits.app.dependencies import current_active_user
from beaverhabits.storage import get_user_dict_storage  # adjust to actual import

PROJECT_ROOT = Path(__file__).resolve().parent.parent
templates = Jinja2Templates(directory=PROJECT_ROOT / "templates")


async def _has_user(session) -> bool:
    result = await session.execute(select(func.count()).select_from(User))
    return result.scalar_one() > 0


def init_page_routes(app: FastAPI) -> None:

    @app.get("/login", response_class=HTMLResponse)
    async def login_page(request: Request, session=Depends(get_async_session)):
        setup_required = not await _has_user(session)
        return templates.TemplateResponse(
            "login.html",
            {"request": request, "setup_required": setup_required},
        )

    @app.get("/", response_class=HTMLResponse)
    async def index_page(request: Request, user: User = Depends(current_active_user)):
        return templates.TemplateResponse("index.html", {"request": request})

    @app.get("/habits/{habit_id}", response_class=HTMLResponse)
    async def habit_detail_page(
        habit_id: str,
        request: Request,
        user: User = Depends(current_active_user),
    ):
        storage = get_user_dict_storage()
        habit_list = await storage.get_user_habit_list(user)
        if habit_list is None:
            return RedirectResponse("/")
        habit = await habit_list.get_habit_by(habit_id)
        if habit is None:
            return RedirectResponse("/")
        return templates.TemplateResponse(
            "habit_detail.html",
            {"request": request, "habit": habit},
        )

    @app.get("/heatmap/{habit_id}", response_class=HTMLResponse)
    async def heatmap_page(
        habit_id: str,
        request: Request,
        user: User = Depends(current_active_user),
    ):
        storage = get_user_dict_storage()
        habit_list = await storage.get_user_habit_list(user)
        habit = await habit_list.get_habit_by(habit_id) if habit_list else None
        if habit is None:
            return RedirectResponse("/")
        return templates.TemplateResponse(
            "heatmap.html",
            {"request": request, "habit": habit},
        )

    @app.get("/stats", response_class=HTMLResponse)
    async def stats_page(request: Request, user: User = Depends(current_active_user)):
        return templates.TemplateResponse("stats.html", {"request": request})
```

- [ ] **Step 2: Wire pages router into `main.py`**

In `beaverhabits/main.py`, uncomment the placeholder added in Task 1.6 and add the import:

```python
from beaverhabits.routes.pages import init_page_routes
# ...later, after init_api_routes(app):
init_page_routes(app)
```

- [ ] **Step 3: Handle 401 redirects**

`current_active_user` returns 401 if not authenticated. We want pages to redirect to `/login` instead. Add to `main.py` (after `app = FastAPI(...)`):

```python
from fastapi.exceptions import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class AuthRedirectMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        is_html_route = request.url.path in ("/", "/stats") or request.url.path.startswith("/habits/") or request.url.path.startswith("/heatmap/")
        if response.status_code == 401 and is_html_route:
            return RedirectResponse("/login")
        return response

app.add_middleware(AuthRedirectMiddleware)
```

(Add `from fastapi.responses import RedirectResponse` if missing.)

- [ ] **Step 4: Smoke test**

Run:
```bash
uv run uvicorn beaverhabits.main:app --port 8765 &
sleep 2
curl -i http://localhost:8765/login | head -20
curl -i http://localhost:8765/ | head -5  # should be 401 then redirect handled by middleware on next call
kill %1
```
Expected: `/login` returns 200 with HTML; `/` returns 307 redirect to `/login`.

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/routes/pages.py beaverhabits/main.py
git commit -m "feat(routes): add page routes and 401-redirect middleware"
```

---

## Phase 6 — JavaScript modules

### Task 6.1: `api.js` — fetch wrapper

**Files:**
- Create: `beaverhabits/static/js/api.js`

- [ ] **Step 1: Implement**

```javascript
// beaverhabits/static/js/api.js
const PUBLIC_PATHS = ['/login'];

export const api = {
    async _fetch(method, path, opts = {}) {
        const init = { method, credentials: 'same-origin', headers: {} };
        if (opts.body !== undefined && !(opts.body instanceof FormData)) {
            init.headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(opts.body);
        } else if (opts.body instanceof FormData) {
            init.body = opts.body;
        }
        const resp = await fetch(path, init);

        if (resp.status === 401 && !PUBLIC_PATHS.includes(window.location.pathname)) {
            window.location.href = '/login';
            return new Promise(() => {}); // never resolves
        }
        if (resp.status === 204) return null;
        const data = await resp.json().catch(() => null);
        if (!resp.ok) {
            const err = new Error(data?.detail || data?.error || `HTTP ${resp.status}`);
            err.status = resp.status;
            err.data = data;
            throw err;
        }
        return data;
    },
    get(path) { return this._fetch('GET', path); },
    post(path, body) { return this._fetch('POST', path, { body }); },
    put(path, body) { return this._fetch('PUT', path, { body }); },
    delete(path) { return this._fetch('DELETE', path); },
    upload(path, formData) { return this._fetch('POST', path, { body: formData }); },
};

export function toast(message, kind = 'success') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.className = `toast show ${kind === 'error' ? 'err' : ''}`;
    setTimeout(() => { el.className = 'toast'; }, 2200);
}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/api.js
git commit -m "feat(js): add api.js fetch wrapper with 401 redirect"
```

---

### Task 6.2: `app.js` — shell behavior

**Files:**
- Create: `beaverhabits/static/js/app.js`

- [ ] **Step 1: Implement**

```javascript
// beaverhabits/static/js/app.js
import { api, toast } from '/static/js/api.js';

// ── Theme toggle ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'midnight' ? '☾' : '☀';
}

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('theme') || 'midnight';
    applyTheme(saved);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.addEventListener('click', () => {
        const cur = localStorage.getItem('theme') || 'midnight';
        applyTheme(cur === 'midnight' ? 'arctic' : 'midnight');
    });
});

// ── Sidebar drawer (mobile) ─────────────────────────────────────
window.openSidebar = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('shade')?.classList.add('open');
};
window.closeSidebar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('shade')?.classList.remove('open');
};

// ── Settings modal ──────────────────────────────────────────────
window.openSettings = async () => {
    document.getElementById('settingsOv')?.classList.add('on');
    await loadSettings();
};
window.closeSettings = () => document.getElementById('settingsOv')?.classList.remove('on');

async function loadSettings() {
    document.getElementById('setThemeSel').value = localStorage.getItem('theme') || 'midnight';

    const tokenInfo = await api.get('/api/v1/tokens');
    const tv = document.getElementById('tokenView');
    if (tokenInfo.token) {
        tv.innerHTML = `
            <input class="finp" readonly value="${tokenInfo.token}">
            <div style="display:flex;gap:6px;margin-top:8px">
                <button class="bgho" id="tokCopy">Copy</button>
                <button class="bdng" id="tokDelete">Delete</button>
            </div>`;
        document.getElementById('tokCopy').onclick = () => {
            navigator.clipboard.writeText(tokenInfo.token);
            toast('Copied to clipboard');
        };
        document.getElementById('tokDelete').onclick = async () => {
            await api.delete('/api/v1/tokens');
            await loadSettings();
        };
    } else {
        tv.innerHTML = `<button class="bpri" id="tokCreate">Generate API token</button>`;
        document.getElementById('tokCreate').onclick = async () => {
            await api.post('/api/v1/tokens');
            await loadSettings();
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('setThemeSel')?.addEventListener('change', (e) => applyTheme(e.target.value));
    document.getElementById('cpSubmit')?.addEventListener('click', async () => {
        const cur = document.getElementById('cpCurrent').value;
        const next = document.getElementById('cpNew').value;
        try {
            await api.post('/auth/change-password', { current_password: cur, new_password: next });
            toast('Password changed');
            document.getElementById('cpCurrent').value = '';
            document.getElementById('cpNew').value = '';
        } catch (e) { toast(e.message, 'error'); }
    });
    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        const data = await api.get('/api/v1/export');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `beaverhabits-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
    document.getElementById('importBtn')?.addEventListener('click', () => document.getElementById('importFile').click());
    document.getElementById('importFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
            const payload = JSON.parse(text);
            await api.post('/api/v1/import', payload);
            toast('Imported');
            window.location.reload();
        } catch (err) { toast(err.message, 'error'); }
    });
});

// ── Logout ───────────────────────────────────────────────────────
window.logout = async () => {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
};
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/app.js
git commit -m "feat(js): add app.js shell behavior — theme, drawer, settings, logout"
```

---

### Task 6.3: `heatmap.js`

**Files:**
- Create: `beaverhabits/static/js/heatmap.js`

- [ ] **Step 1: Implement**

```javascript
// beaverhabits/static/js/heatmap.js
import { api } from '/static/js/api.js';

function levelFor(streak) {
    if (streak >= 7) return 4;
    if (streak >= 4) return 3;
    if (streak >= 2) return 2;
    if (streak >= 1) return 1;
    return 0;
}

export function renderSingleHeatmap(container, days, weeks = 26) {
    container.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const doneSet = new Set(days.filter(d => d.done).map(d => d.date));
    const cells = weeks * 7;
    const start = new Date(today);
    start.setDate(start.getDate() - cells + 1);

    let streak = 0;
    for (let i = 0; i < cells; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const cell = document.createElement('div');
        cell.className = 'hm-cell';
        if (doneSet.has(iso)) {
            streak += 1;
            cell.classList.add(`l${levelFor(streak)}`);
        } else {
            streak = 0;
        }
        cell.title = `${iso}${doneSet.has(iso) ? ' ✓' : ''}`;
        container.appendChild(cell);
    }
}

export async function renderHabitDetailHeatmap() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=1`);
    const days = data.years[0].days;
    renderSingleHeatmap(document.getElementById('dHeatmap'), days, 26);
}

export async function renderMultiYearHeatmap() {
    const root = document.getElementById('multiYearRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=5`);
    const container = document.getElementById('yearsContainer');
    container.innerHTML = '';
    for (const year of data.years) {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '20px';
        const title = document.createElement('div');
        title.className = 'ss-title';
        title.textContent = year.year;
        const grid = document.createElement('div');
        grid.className = 'heatmap year';
        // pad start so Jan 1 lands in the right cell of week 0
        const jan1 = new Date(year.year, 0, 1);
        const padStart = jan1.getDay(); // 0=Sun
        for (let i = 0; i < padStart; i++) {
            const empty = document.createElement('div');
            empty.style.background = 'transparent';
            grid.appendChild(empty);
        }
        for (const d of year.days) {
            const c = document.createElement('div');
            c.className = 'hm-cell' + (d.done ? ' l3' : '');
            c.title = d.date;
            grid.appendChild(c);
        }
        wrap.appendChild(title);
        wrap.appendChild(grid);
        container.appendChild(wrap);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/heatmap.js
git commit -m "feat(js): add heatmap.js for single-year and multi-year rendering"
```

---

### Task 6.4: `notes.js` — note editor modal

**Files:**
- Create: `beaverhabits/static/js/notes.js`

- [ ] **Step 1: Implement**

```javascript
// beaverhabits/static/js/notes.js
import { api, toast } from '/static/js/api.js';

let currentContext = null; // { habitId, date, onSave }

export function openNoteEditor({ habitId, date, existing, onSave }) {
    currentContext = { habitId, date, onSave };
    document.getElementById('noteDate').value = date;
    document.getElementById('noteText').value = existing?.note || '';
    document.getElementById('noteImagePreview').innerHTML = existing?.image_url
        ? `<img src="${existing.image_url}" style="max-width:100%;border-radius:8px">` : '';
    document.getElementById('noteOv').classList.add('on');
}

export function closeNote() {
    document.getElementById('noteOv').classList.remove('on');
    currentContext = null;
}

window.closeNote = closeNote;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('noteImage')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
            const { url } = await api.upload('/api/v1/uploads', fd);
            document.getElementById('noteImagePreview').innerHTML = `<img src="${url}" style="max-width:100%;border-radius:8px"><input type="hidden" id="noteImageUrl" value="${url}">`;
        } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('noteSave')?.addEventListener('click', async () => {
        if (!currentContext) return;
        const text = document.getElementById('noteText').value;
        const imageUrl = document.getElementById('noteImageUrl')?.value || null;
        await api.post(`/api/v1/habits/${currentContext.habitId}/completions`, {
            date: currentContext.date,
            note: text,
            image_url: imageUrl,
        });
        currentContext.onSave?.();
        toast('Saved');
        closeNote();
    });

    document.getElementById('noteDelete')?.addEventListener('click', async () => {
        if (!currentContext) return;
        await api.post(`/api/v1/habits/${currentContext.habitId}/completions`, {
            date: currentContext.date,
            note: null,
            image_url: null,
        });
        currentContext.onSave?.();
        closeNote();
    });
});
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/notes.js
git commit -m "feat(js): add notes.js note editor modal with image upload"
```

---

### Task 6.5: `habits.js` — grid rendering and checkbox cycling

**Files:**
- Create: `beaverhabits/static/js/habits.js`

- [ ] **Step 1: Implement**

```javascript
// beaverhabits/static/js/habits.js
import { api, toast } from '/static/js/api.js';
import { openNoteEditor } from '/static/js/notes.js';
import { renderSingleHeatmap, renderHabitDetailHeatmap } from '/static/js/heatmap.js';

const STATUS_CYCLE = ['', 'yes', 'no', 'skip'];

let allHabits = [];
let activeFilter = 'all';
let activeTag = null;
let searchTerm = '';
let sortMode = 'manual';

function dateNDaysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

function renderDayLabels() {
    const labels = document.getElementById('dayLabels');
    if (!labels) return;
    const out = [];
    for (let i = 6; i >= 0; i--) {
        const d = dateNDaysAgo(i);
        out.push(d.toLocaleDateString(undefined, { weekday: 'narrow' }));
    }
    labels.innerHTML = out.map(l => `<span style="width:26px;text-align:center">${l}</span>`).join('');
}

function statusFromRecords(records, isoDay) {
    const rec = records.find(r => r.day === isoDay);
    if (!rec) return '';
    if (rec.status) return rec.status;
    return rec.done ? 'yes' : '';
}

function nextStatus(cur, allowed) {
    const cycle = ['', ...allowed];
    const idx = cycle.indexOf(cur);
    return cycle[(idx + 1) % cycle.length];
}

function renderRow(habit) {
    const row = document.createElement('div');
    row.className = 'hrow';
    row.dataset.habitId = habit.id;

    const icon = document.createElement('div');
    icon.className = 'hicon';
    icon.textContent = habit.icon || '📌';
    icon.onclick = () => window.location = `/habits/${habit.id}`;

    const name = document.createElement('div');
    name.className = 'hname';
    name.textContent = habit.name;
    name.onclick = () => window.location = `/habits/${habit.id}`;

    const checks = document.createElement('div');
    checks.className = 'hchecks';
    const allowed = habit.chips?.length ? habit.chips : ['yes'];
    for (let i = 6; i >= 0; i--) {
        const d = dateNDaysAgo(i);
        const iso = isoDate(d);
        const cur = statusFromRecords(habit.records || [], iso);
        const chk = document.createElement('button');
        chk.className = 'hchk';
        chk.dataset.status = cur;
        chk.dataset.date = iso;
        chk.title = iso;
        attachCheckHandlers(chk, habit, allowed);
        checks.appendChild(chk);
    }

    row.append(icon, name, checks);

    const editBtn = document.createElement('button');
    editBtn.className = 'ibtn';
    editBtn.textContent = '✎';
    editBtn.onclick = (e) => { e.stopPropagation(); expandRow(row, habit); };
    row.appendChild(editBtn);

    return row;
}

function attachCheckHandlers(chk, habit, allowed) {
    let pressTimer = null;
    let longPressed = false;

    const startPress = () => {
        longPressed = false;
        pressTimer = setTimeout(() => {
            longPressed = true;
            openNoteEditor({
                habitId: habit.id,
                date: chk.dataset.date,
                existing: (habit.records || []).find(r => r.day === chk.dataset.date),
                onSave: refreshHabits,
            });
        }, 500);
    };
    const endPress = () => clearTimeout(pressTimer);

    chk.addEventListener('mousedown', startPress);
    chk.addEventListener('touchstart', startPress, { passive: true });
    chk.addEventListener('mouseup', endPress);
    chk.addEventListener('touchend', endPress);
    chk.addEventListener('mouseleave', endPress);

    chk.addEventListener('click', async () => {
        if (longPressed) return;
        const cur = chk.dataset.status;
        const next = nextStatus(cur, allowed);
        chk.dataset.status = next; // optimistic
        try {
            await api.post(`/api/v1/habits/${habit.id}/completions`, {
                date: chk.dataset.date,
                status: next || null,
            });
        } catch (err) {
            chk.dataset.status = cur;
            toast(err.message, 'error');
        }
    });
}

function expandRow(row, habit) {
    if (row.classList.contains('expanded')) return;
    const tpl = document.getElementById('habitFormTemplate');
    const clone = tpl.content.cloneNode(true);
    row.innerHTML = '';
    row.classList.add('expanded');
    row.appendChild(clone);

    row.querySelector('[name=name]').value = habit.name;
    row.querySelector('[name=frequency]').value = habit.frequency || 'daily';
    row.querySelector('[name=tags]').value = (habit.tags || []).join(', ');
    row.querySelector('[name=chips]').value = (habit.chips || []).join(', ');

    row.querySelector('[data-action=cancel]').onclick = refreshHabits;
    row.querySelector('[data-action=delete]').onclick = async () => {
        if (!confirm('Delete this habit?')) return;
        await api.delete(`/api/v1/habits/${habit.id}`);
        await refreshHabits();
    };
    row.querySelector('[data-action=save]').onclick = async () => {
        const body = {
            name: row.querySelector('[name=name]').value.trim(),
            frequency: row.querySelector('[name=frequency]').value,
            tags: row.querySelector('[name=tags]').value.split(',').map(s => s.trim()).filter(Boolean),
            chips: row.querySelector('[name=chips]').value.split(',').map(s => s.trim()).filter(Boolean),
        };
        try {
            await api.put(`/api/v1/habits/${habit.id}`, body);
            toast('Saved');
            await refreshHabits();
        } catch (e) { toast(e.message, 'error'); }
    };
}

function expandNewRow() {
    const grid = document.getElementById('hgrid');
    const row = document.createElement('div');
    row.className = 'hrow expanded';
    grid.prepend(row);
    const tpl = document.getElementById('habitFormTemplate');
    row.appendChild(tpl.content.cloneNode(true));
    row.querySelector('[data-action=delete]').style.visibility = 'hidden';
    row.querySelector('[data-action=cancel]').onclick = () => row.remove();
    row.querySelector('[data-action=save]').onclick = async () => {
        const body = {
            name: row.querySelector('[name=name]').value.trim(),
            frequency: row.querySelector('[name=frequency]').value,
            tags: row.querySelector('[name=tags]').value.split(',').map(s => s.trim()).filter(Boolean),
            chips: row.querySelector('[name=chips]').value.split(',').map(s => s.trim()).filter(Boolean),
        };
        if (!body.name) { toast('Name is required', 'error'); return; }
        try {
            await api.post('/api/v1/habits', body);
            toast('Created');
            await refreshHabits();
        } catch (e) { toast(e.message, 'error'); }
    };
}

function applyFilters(habits) {
    let out = habits;
    if (activeFilter !== 'all') out = out.filter(h => h.frequency === activeFilter);
    if (activeTag) out = out.filter(h => (h.tags || []).includes(activeTag));
    if (searchTerm) out = out.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (sortMode === 'az') out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'updated') out = [...out].sort((a, b) => (b.updated_at || 0).localeCompare(a.updated_at || 0));
    return out;
}

function renderTagSidebar() {
    const tagSet = new Set();
    allHabits.forEach(h => (h.tags || []).forEach(t => tagSet.add(t)));
    const ul = document.getElementById('tagList');
    if (!ul) return;
    ul.innerHTML = [...tagSet].map(t =>
        `<li class="fi-item${activeTag === t ? ' on' : ''}" data-tag="${t}"><div class="fn">#${t}</div></li>`
    ).join('');
    ul.querySelectorAll('.fi-item').forEach(el => {
        el.onclick = () => {
            activeTag = activeTag === el.dataset.tag ? null : el.dataset.tag;
            renderTagSidebar();
            renderGrid();
        };
    });
}

function renderGrid() {
    const grid = document.getElementById('hgrid');
    grid.innerHTML = '';
    const filtered = applyFilters(allHabits);
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty"><p>No habits yet.</p><p class="hint">Click + ADD to create one.</p></div>';
        return;
    }
    filtered.forEach(h => grid.appendChild(renderRow(h)));

    if (sortMode === 'manual' && window.Sortable) {
        new Sortable(grid, {
            animation: 150,
            handle: '.hicon',
            onEnd: async () => {
                const order = [...grid.querySelectorAll('.hrow')].map(el => el.dataset.habitId).filter(Boolean);
                try { await api.put('/api/v1/habits/meta', { order }); } catch (e) { toast(e.message, 'error'); }
            },
        });
    }
}

export async function refreshHabits() {
    allHabits = await api.get('/api/v1/habits');
    renderTagSidebar();
    renderGrid();
}

export async function renderHabitDetail() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const habit = await api.get(`/api/v1/habits/${habitId}`);
    document.getElementById('dName').textContent = habit.name;
    document.getElementById('dMeta').textContent = `${habit.frequency || 'daily'}${habit.tags?.length ? ' · ' + habit.tags.map(t => '#' + t).join(' ') : ''}`;
    document.getElementById('dIcon').textContent = habit.icon || '📌';

    const stats = await api.get(`/api/v1/habits/${habitId}/stats`);
    document.getElementById('dStreak').textContent = stats.streak;
    document.getElementById('d30').textContent = `${stats.percent_30d}%`;
    document.getElementById('dTotal').textContent = stats.total;

    await renderHabitDetailHeatmap();

    document.getElementById('dEditBtn').onclick = () => window.location = '/?edit=' + habitId;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('hgrid')) {
        renderDayLabels();
        refreshHabits();

        document.getElementById('addBtn').addEventListener('click', expandNewRow);
        document.getElementById('searchIn').addEventListener('input', (e) => { searchTerm = e.target.value; renderGrid(); });
        document.getElementById('sortSel').addEventListener('change', (e) => { sortMode = e.target.value; renderGrid(); });
        document.querySelectorAll('.tbtn').forEach(btn => btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
            e.currentTarget.classList.add('on');
            activeFilter = e.currentTarget.dataset.filter;
            renderGrid();
        }));

        const params = new URLSearchParams(window.location.search);
        if (params.get('edit')) {
            // wait one tick for grid to render then expand
            setTimeout(() => {
                const id = params.get('edit');
                const row = document.querySelector(`.hrow[data-habit-id="${id}"]`);
                const habit = allHabits.find(h => h.id === id);
                if (row && habit) expandRow(row, habit);
            }, 100);
        }
    }
});
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/js/habits.js
git commit -m "feat(js): add habits.js — grid, checkbox cycling, inline-expand, filters, drag-reorder"
```

---

## Phase 7 — Docker + deployment

### Task 7.1: Update `Dockerfile`

**Files:**
- Modify: `Dockerfile`

- [ ] **Step 1: Replace contents**

```dockerfile
# Dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/.venv ./.venv
COPY beaverhabits ./beaverhabits
ENV PATH="/app/.venv/bin:$PATH"
ENV DATA_DIR=/data
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -f http://localhost:8765/health || exit 1
CMD ["uvicorn", "beaverhabits.main:app", "--host", "0.0.0.0", "--port", "8765"]
```

- [ ] **Step 2: Build locally**

Run: `docker build -t beaverhabits:test .`
Expected: builds without error. Final image ~100 MB.

- [ ] **Step 3: Commit**

```bash
git add Dockerfile
git commit -m "build: simplify Dockerfile, port 8765, multi-stage"
```

---

### Task 7.2: Update `docker-compose.example.yml`

**Files:**
- Modify (or create): `docker-compose.example.yml`

- [ ] **Step 1: Write compose file**

```yaml
services:
  beaverhabits:
    image: beaverhabits:latest
    build: .
    container_name: beaverhabits
    restart: unless-stopped
    ports:
      - "8765:8765"
    volumes:
      - ./data:/data
    environment:
      - SECRET_KEY=change-me-to-a-long-random-string
      - TIME_ZONE=UTC
```

- [ ] **Step 2: Run end-to-end smoke**

```bash
cp docker-compose.example.yml docker-compose.yml
docker compose up -d --build
sleep 4
curl -i http://localhost:8765/login | head -10
curl -i http://localhost:8765/health
docker compose down
```
Expected: `/login` returns 200; `/health` returns 200.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.example.yml
git commit -m "build: update docker-compose.example.yml for new layout"
```

---

### Task 7.3: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace setup section**

Replace the "Quick Start" / "Installation" section in `README.md` with:

```markdown
## Quick Start

```bash
git clone https://github.com/<your-fork>/beaverhabits.git
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
| `SECRET_KEY` | (required) | Session cookie signing |
| `DATABASE_URL` | `sqlite+aiosqlite:////data/db.sqlite` | DB connection |
| `DATA_DIR` | `/data` | DB file + uploaded images |
| `TIME_ZONE` | `UTC` | Override browser-detected timezone |
| `DEFAULT_COMPLETION_STATUS_LIST` | `yes,no` | Default chips for new habits |
```

- [ ] **Step 2: Strip outdated sections**

Remove any sections referring to NiceGUI, Telegram, Paddle, Sentry, Google OAuth, demo mode.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: rewrite README for the new stack"
```

---

## Phase 8 — Testing

### Task 8.1: Playwright smoke test

**Files:**
- Create: `tests/e2e/test_smoke.py`
- Create: `tests/e2e/conftest.py`
- Modify: `pyproject.toml` (Playwright already added in Task 1.1)

- [ ] **Step 1: Install Playwright browsers**

Run: `uv run --group e2e playwright install chromium`
Expected: downloads Chromium.

- [ ] **Step 2: Write conftest**

```python
# tests/e2e/conftest.py
import os
import subprocess
import time
import pytest


@pytest.fixture(scope="session")
def server():
    env = {**os.environ, "SECRET_KEY": "test" * 16, "DATABASE_URL": "sqlite+aiosqlite:///./e2e.db"}
    proc = subprocess.Popen(
        ["uv", "run", "uvicorn", "beaverhabits.main:app", "--port", "8766"],
        env=env,
    )
    time.sleep(3)
    yield "http://localhost:8766"
    proc.terminate()
    if os.path.exists("e2e.db"):
        os.remove("e2e.db")
```

- [ ] **Step 3: Write smoke test**

```python
# tests/e2e/test_smoke.py
import pytest
from playwright.sync_api import sync_playwright


@pytest.mark.e2e
def test_setup_login_add_tick_persists(server):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context()
        page = ctx.new_page()

        # First-run: setup
        page.goto(f"{server}/login")
        page.fill("#passwordIn", "testpass1234")
        page.fill("#confirmIn", "testpass1234")
        page.click("button.auth-btn")
        page.wait_for_url(f"{server}/")

        # Add habit
        page.click("#addBtn")
        page.fill("input[name=name]", "Drink water")
        page.click("button[data-action=save]")
        page.wait_for_selector(".hrow .hname", timeout=3000)
        assert "Drink water" in page.text_content(".hrow .hname")

        # Tick today's checkbox
        chk = page.locator(".hchk").last
        chk.click()
        page.wait_for_function("document.querySelector('.hchk:last-of-type').dataset.status === 'yes'", timeout=3000)

        # Reload, verify
        page.reload()
        page.wait_for_selector(".hchk", timeout=3000)
        last_status = page.evaluate("document.querySelector('.hchk:last-of-type').dataset.status")
        assert last_status == "yes"

        browser.close()
```

- [ ] **Step 4: Run**

Run: `uv run --group e2e pytest tests/e2e/ -v -m e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/conftest.py tests/e2e/test_smoke.py
git commit -m "test: add Playwright smoke test for setup→add→tick→persist"
```

---

### Task 8.2: Run full backend suite

- [ ] **Step 1: Run everything**

Run: `uv run pytest tests/ -v --ignore=tests/e2e`
Expected: all backend tests pass.

- [ ] **Step 2: Fix any breakage**

If a test references a removed module or env var, either update or delete the test as appropriate. Commit each fix individually:
```bash
git commit -m "test: fix <name> after frontend rewrite"
```

---

### Task 8.3: Manual smoke test in Docker

- [ ] **Step 1: Start container**

```bash
docker compose up --build
```

- [ ] **Step 2: Walk through every page**

Browse to `http://localhost:8765` and verify each of the following in **both midnight and arctic themes** on **desktop and mobile viewports** (Chrome DevTools device toolbar):

- [ ] First-run shows "Create master password"; setup succeeds; redirects to home.
- [ ] Login form rejects wrong password, accepts correct.
- [ ] Home page renders empty state when no habits exist.
- [ ] `+ Add` opens inline-expand form; saving creates a habit.
- [ ] Editing a habit (✎ button) opens inline-expand prefilled.
- [ ] Deleting a habit removes it.
- [ ] Multi-state checkbox cycles correctly across three statuses.
- [ ] Long-press on checkbox opens note editor; image upload works.
- [ ] Drag-to-reorder by holding the icon persists across reload.
- [ ] Sidebar tag filters work; clicking a tag toggles it.
- [ ] Search filters habits live.
- [ ] Sort dropdown changes order.
- [ ] Habit detail page renders heatmap, stats, notes.
- [ ] Multi-year heatmap renders 5 years.
- [ ] Stats page renders.
- [ ] Settings: theme switcher, change password, export downloads JSON, import accepts the export, API token create/delete.
- [ ] Logout returns to /login.
- [ ] Mobile: hamburger opens drawer; shade closes it; everything is reachable.

- [ ] **Step 3: Stop**

```bash
docker compose down
```

---

## Self-review notes

This plan covers every section of the design spec:

- **Project structure** → Phase 1 deletes/trims; Phase 4 creates templates; Phase 6 creates JS modules
- **IA / routes** → Phase 5 creates `routes/pages.py`
- **Modals (settings, note, confirm)** → Task 4.5 + Tasks 6.2/6.4
- **Inline-expand** → Task 6.5
- **Auth (master password setup, change password)** → Tasks 2.1/2.2/2.3
- **API additions (stats, heatmap, uploads, tokens, export/import)** → Tasks 2.4–2.8
- **Two themes** → Task 3.1
- **Frontend pages (login/index/detail/heatmap/stats)** → Tasks 4.2/4.3/4.4
- **Mobile** → Task 3.1 (lifted media queries) + drawer in `app.js`
- **Docker** → Tasks 7.1/7.2
- **Testing** → Tasks 8.1–8.3
- **Out-of-scope (overview heatmap, extra themes, browser extension, WebAuthn)** → not represented, as intended

Tasks where path/import names are guessed from inspection (storage helpers, fastapi-users password helper internals) are explicitly flagged with "verify by grep" — first-pass implementer should check these before pasting.
