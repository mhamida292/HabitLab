# habitlab/auth.py
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import HTTPException, Request
from fastapi.security.utils import get_authorization_scheme_param
from passlib.context import CryptContext
from starlette.status import HTTP_401_UNAUTHORIZED

from habitlab.configs import settings
from habitlab.models import User

# bcrypt for new hashes; argon2 listed so we can verify legacy hashes from
# FastAPI-Users 14.x which used argon2 as its primary algorithm.
_pwd_ctx = CryptContext(schemes=["bcrypt", "argon2"], deprecated=["argon2"])


def hash_password(plain: str) -> str:
    return _pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _pwd_ctx.verify(plain, hashed)
    except Exception:
        return False


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
