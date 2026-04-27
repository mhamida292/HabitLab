from fastapi import FastAPI

from .users import auth_backend, fastapi_users


def init_auth_routes(app: FastAPI) -> None:
    app.include_router(
        fastapi_users.get_auth_router(auth_backend),
        prefix="/auth",
        tags=["auth"],
    )
