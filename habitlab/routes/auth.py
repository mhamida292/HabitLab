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
