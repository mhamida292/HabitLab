import pytest
import datetime
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from fastapi_users.db import SQLAlchemyUserDatabase

from habitlab.main import app
from habitlab.app.db import Base, get_async_session, User
from habitlab.app.schemas import UserCreate
from habitlab.app.users import UserManager
from habitlab.app.dependencies import current_active_user


@pytest.fixture
async def test_engine():
    """Create an in-memory SQLite database for testing."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    await engine.dispose()


@pytest.fixture
async def test_async_session(test_engine):
    """Create a session factory for testing."""
    async_session = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    return async_session


@pytest.fixture
async def authed_client(test_async_session):
    """Create an authenticated test client."""
    # Override the get_async_session dependency to use test database
    async def override_get_async_session():
        async with test_async_session() as session:
            yield session

    app.dependency_overrides[get_async_session] = override_get_async_session

    # Create test user directly via the test session (avoids global session context)
    async with test_async_session() as session:
        user_db = SQLAlchemyUserDatabase(session, User)
        user_manager = UserManager(user_db)
        test_user = await user_manager.create(
            UserCreate(
                email="test@example.com",
                password="testpassword",
                is_superuser=False,
            )
        )

    # Override current_active_user to return the test user directly,
    # bypassing JWT validation which would hit the real (non-test) DB.
    async def override_current_active_user():
        return test_user

    app.dependency_overrides[current_active_user] = override_current_active_user

    # Create authenticated client (no token needed since auth is overridden)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest.fixture
async def habit(authed_client):
    """Create a test habit for the authenticated user."""
    response = await authed_client.post(
        "/api/v1/habits",
        json={"name": "Test Habit", "target_count": 1},
    )
    assert response.status_code == 200, f"Failed to create habit: {response.text}"
    return response.json()
