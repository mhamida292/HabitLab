from fastapi import Depends, FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from beaverhabits.app import crud as auth_crud
from beaverhabits.app.db import User, get_async_session
from beaverhabits.app.dependencies import current_active_user
from beaverhabits.app.schemas import UserCreate
from beaverhabits.app.users import auth_backend, fastapi_users, get_user_manager
from beaverhabits.app.users import UserManager


async def _setup_required(session: AsyncSession) -> bool:
    """Return True if no users exist (setup has not been completed)."""
    count = await auth_crud.get_user_count()
    return count == 0


def init_auth_routes(app: FastAPI) -> None:
    app.include_router(
        fastapi_users.get_auth_router(auth_backend),
        prefix="/auth",
        tags=["auth"],
    )

    @app.get("/auth/status", tags=["auth"])
    async def auth_status(
        request: Request,
        session: AsyncSession = Depends(get_async_session),
    ):
        setup_required = await _setup_required(session)
        # Auth uses Bearer tokens; check Authorization header
        auth_header = request.headers.get("Authorization", "")
        logged_in = auth_header.lower().startswith("bearer ")
        return {"setup_required": setup_required, "logged_in": logged_in}

    class SetupBody(BaseModel):
        password: str = Field(min_length=8, max_length=128)

    @app.post("/auth/setup", tags=["auth"])
    async def auth_setup(
        body: SetupBody,
        session: AsyncSession = Depends(get_async_session),
        user_manager: UserManager = Depends(get_user_manager),
    ):
        if not await _setup_required(session):
            raise HTTPException(status_code=409, detail="Setup already completed")
        create = UserCreate(email="admin@beaverhabits.local", password=body.password)
        user = await user_manager.create(create)
        return {"id": str(user.id), "email": user.email}

    class ChangePasswordBody(BaseModel):
        current_password: str = Field(min_length=1)
        new_password: str = Field(min_length=8, max_length=128)

    @app.post("/auth/change-password", tags=["auth"], status_code=204)
    async def change_password(
        body: ChangePasswordBody,
        user: User = Depends(current_active_user),
        user_manager: UserManager = Depends(get_user_manager),
    ):
        valid, _ = user_manager.password_helper.verify_and_update(
            body.current_password, user.hashed_password
        )
        if not valid:
            raise HTTPException(
                status_code=400, detail="Current password is incorrect"
            )
        await user_manager._update(user, {"password": body.new_password})
        return Response(status_code=204)
