# habitlab/db.py
import json
import re
from pathlib import Path

import aiosqlite

from habitlab.configs import settings


def _db_path() -> str:
    m = re.match(r"^sqlite\+aiosqlite:///(.+)$", settings.DATABASE_URL)
    return m.group(1) if m else settings.DATABASE_URL


DB_PATH: str = _db_path()


async def init_db() -> None:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS habit_list (
                id   INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            )
            """
        )
        await db.commit()


async def get_password_hash() -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute(
            "SELECT value FROM settings WHERE key = 'password_hash'"
        ) as cur:
            row = await cur.fetchone()
            return row[0] if row else None


async def set_password_hash(hashed: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?)",
            (hashed,),
        )
        await db.commit()


async def get_habit_list() -> dict:
    async with aiosqlite.connect(DB_PATH) as db:
        async with db.execute("SELECT data FROM habit_list WHERE id = 1") as cur:
            row = await cur.fetchone()
            return json.loads(row[0]) if row else {}


async def save_habit_list(data: dict) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO habit_list (id, data) VALUES (1, ?)",
            (json.dumps(data),),
        )
        await db.commit()


async def reset_app() -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM settings WHERE key = 'password_hash'")
        await db.execute("DELETE FROM habit_list WHERE id = 1")
        await db.commit()
