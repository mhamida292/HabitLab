import contextlib
import uuid
from typing import Sequence
from uuid import UUID

from sqlalchemy import select

from beaverhabits.logger import logger

from .db import (
    HabitListModel,
    User,
    UserApiTokenModel,
    UserNoteImageModel,
    get_async_session,
)

get_async_session_context = contextlib.asynccontextmanager(get_async_session)


async def update_user_habit_list(user: User, data: dict) -> None:
    async with get_async_session_context() as session:
        assert data, "Habit list data cannot be empty"

        stmt = select(HabitListModel).where(HabitListModel.user_id == user.id)
        result = await session.execute(stmt)
        habit_list = result.scalar()
        logger.info(f"[CRUD] User {user.id} habit list query")

        if not habit_list:
            session.add(
                HabitListModel(data=data, user_id=user.id),
            )
            await session.commit()
            logger.info(f"[CRUD] User {user.id} habit list created")
            return

        if habit_list.data == data:
            logger.warning(f"[CRUD] User {user.id} habit list unchanged")
            return

        habit_list.data = data
        await session.commit()
        logger.info(f"[CRUD] User {user.id} habit list updated")


async def get_user_habit_list(user: User) -> HabitListModel | None:
    async with get_async_session_context() as session:
        stmt = select(HabitListModel).where(HabitListModel.user_id == user.id)
        result = await session.execute(stmt)
        logger.info(f"[CRUD] User {user.id} habit list query")
        return result.scalar()


async def get_user_count() -> int:
    async with get_async_session_context() as session:
        stmt = select(User)
        result = await session.execute(stmt)
        user_count = len(result.all())
        logger.info(f"[CRUD] User count query: {user_count}")
        return user_count


async def get_user_list() -> Sequence[User]:
    async with get_async_session_context() as session:
        stmt = select(User).order_by(User.updated_at.desc())
        result = await session.execute(stmt)
        user_list = result.scalars().all()
        logger.info(f"[CRUD] User list query: {len(user_list)}")
        return user_list


async def save_user_image(user: User, image: bytes) -> UserNoteImageModel:
    async with get_async_session_context() as session:
        user_image = UserNoteImageModel(
            unique_id=uuid.uuid4(), user_id=user.id, blob=image
        )
        session.add(user_image)
        await session.commit()
        logger.info(f"[CRUD] User {user} image saved: {user_image.unique_id}")
        return user_image


async def get_user_image(uuid: UUID, user: User) -> UserNoteImageModel | None:
    async with get_async_session_context() as session:
        stmt = select(UserNoteImageModel).where(
            UserNoteImageModel.unique_id == uuid, UserNoteImageModel.user_id == user.id
        )
        result = await session.execute(stmt)
        user_image = result.scalar()
        if user_image:
            logger.info(f"[CRUD] User {user} image retrieved: {user_image.unique_id}")
        else:
            logger.warning(f"[CRUD] User {user.id} image not found: {uuid}")
        return user_image


async def get_user_api_token(user: User) -> str | None:
    async with get_async_session_context() as session:
        stmt = select(UserApiTokenModel).where(UserApiTokenModel.user_id == user.id)
        result = await session.execute(stmt)
        token_model = result.scalar()
        if token_model:
            return token_model.token
        return None


async def create_user_api_token(user: User) -> str:
    import secrets

    token = secrets.token_urlsafe(32)
    async with get_async_session_context() as session:
        token_model = UserApiTokenModel(token=token, user_id=user.id)
        session.add(token_model)
        await session.commit()
        logger.info(f"[CRUD] User {user.id} API token created")
        return token


async def reset_user_api_token(user: User) -> str:
    import secrets

    new_token = secrets.token_urlsafe(32)
    async with get_async_session_context() as session:
        stmt = select(UserApiTokenModel).where(UserApiTokenModel.user_id == user.id)
        result = await session.execute(stmt)
        token_model = result.scalar()
        if token_model:
            token_model.token = new_token
            await session.commit()
            logger.info(f"[CRUD] User {user.id} API token reset")
        else:
            token_model = UserApiTokenModel(token=new_token, user_id=user.id)
            session.add(token_model)
            await session.commit()
            logger.info(f"[CRUD] User {user.id} API token created (via reset)")
        return new_token


async def delete_user_api_token(user: User) -> None:
    async with get_async_session_context() as session:
        stmt = select(UserApiTokenModel).where(UserApiTokenModel.user_id == user.id)
        result = await session.execute(stmt)
        token_model = result.scalar()
        if token_model:
            await session.delete(token_model)
            await session.commit()
            logger.info(f"[CRUD] User {user.id} API token deleted")


async def get_user_by_api_token(token: str) -> User | None:
    async with get_async_session_context() as session:
        stmt = select(UserApiTokenModel).where(UserApiTokenModel.token == token)
        result = await session.execute(stmt)
        token_model = result.scalar()
        if token_model:
            user_stmt = select(User).where(User.id == token_model.user_id)
            user_result = await session.execute(user_stmt)
            return user_result.scalar()
        return None
