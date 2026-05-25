import pytest
import datetime
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from beaverhabits.main import app
from beaverhabits.app.db import Base, get_async_session
from beaverhabits.app.auth import user_create, user_authenticate, user_create_token


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

    # Create test user
    test_user = await user_create(
        email="test@example.com",
        password="testpassword",
        is_superuser=False,
    )

    # Create auth token
    token = await user_create_token(test_user)

    # Create authenticated client
    async with AsyncClient(app=app, base_url="http://test") as client:
        client.headers["Authorization"] = f"Bearer {token}"
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
