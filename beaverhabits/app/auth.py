import contextlib
from typing import Optional
from uuid import UUID

from fastapi.security import OAuth2PasswordRequestForm
from fastapi_users.exceptions import UserAlreadyExists

from beaverhabits.app.db import User, get_async_session, get_user_db
from beaverhabits.app.schemas import UserCreate
from beaverhabits.app.users import get_jwt_strategy, get_user_manager
from beaverhabits.logger import logger

get_async_session_context = contextlib.asynccontextmanager(get_async_session)
get_user_db_context = contextlib.asynccontextmanager(get_user_db)
get_user_manager_context = contextlib.asynccontextmanager(get_user_manager)


async def user_authenticate(email: str, password: str) -> Optional[User]:
    try:
        assert email, "Email must be provided"
        assert password, "Password must be provided"

        async with get_async_session_context() as session:
            async with get_user_db_context(session) as user_db:
                async with get_user_manager_context(user_db) as user_manager:
                    credentials = OAuth2PasswordRequestForm(
                        username=email, password=password
                    )
                    user = await user_manager.authenticate(credentials)
                    if user is None or not user.is_active:
                        return None
                    return user
    except Exception:
        logger.exception("Unknown exception during authentication")
        return None


async def user_create_token(user: User) -> Optional[str]:
    try:
        async with get_async_session_context() as session:
            async with get_user_db_context(session) as user_db:
                async with get_user_manager_context(user_db):
                    strategy = get_jwt_strategy()
                    token = await strategy.write_token(user)
                    return token or None
    except Exception:
        return None


async def user_check_token(token: str | None) -> bool:
    try:
        async with get_async_session_context() as session:
            async with get_user_db_context(session) as user_db:
                async with get_user_manager_context(user_db) as user_manager:
                    if token is None:
                        return False
                    strategy = get_jwt_strategy()
                    user = await strategy.read_token(token, user_manager)
                    return bool(user and user.is_active)
    except Exception:
        return False


async def user_from_token(token: str | None) -> User | None:
    async with get_async_session_context() as session:
        async with get_user_db_context(session) as user_db:
            async with get_user_manager_context(user_db) as user_manager:
                if not token:
                    return None
                strategy = get_jwt_strategy()
                user = await strategy.read_token(token, user_manager)
                return user


async def user_create(
    email: str, password: str = "", is_superuser: bool = False
) -> User:
    try:
        async with get_async_session_context() as session:
            async with get_user_db_context(session) as user_db:
                async with get_user_manager_context(user_db) as user_manager:
                    user = await user_manager.create(
                        UserCreate(
                            email=email,
                            password=password,
                            is_superuser=is_superuser,
                        )
                    )
                    return user
    except UserAlreadyExists:
        raise Exception("User already exists!")


async def user_get_by_email(email: str) -> Optional[User]:
    try:
        async with get_async_session_context() as session:
            async with get_user_db_context(session) as user_db:
                async with get_user_manager_context(user_db) as user_manager:
                    user = await user_manager.get_by_email(email)
                    return user
    except Exception:
        return None


async def user_get_by_id(user_id: UUID) -> User:
    async with get_async_session_context() as session:
        async with get_user_db_context(session) as user_db:
            async with get_user_manager_context(user_db) as user_manager:
                return await user_manager.get(user_id)


def user_logout() -> bool:
    return True


async def user_reset_password(user: User, new_password: str) -> User:
    async with get_async_session_context() as session:
        async with get_user_db_context(session) as user_db:
            async with get_user_manager_context(user_db) as user_manager:
                updated_user = await user_manager._update(
                    user, {"password": new_password}
                )
                return updated_user


async def user_deletion(user: User) -> None:
    async with get_async_session_context() as session:
        async with get_user_db_context(session) as user_db:
            async with get_user_manager_context(user_db) as user_manager:
                await user_manager.delete(user)
