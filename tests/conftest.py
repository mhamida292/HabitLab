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
