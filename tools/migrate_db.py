#!/usr/bin/env python3
"""CLI wrapper — run the DB migration manually.

Usage: uv run python tools/migrate_db.py
"""
import asyncio
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from habitlab.migrate import migrate_if_needed


def _get_db_path() -> str:
    """Extract the DB path from DATABASE_URL environment variable."""
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass
    url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./.user/habits.db")
    m = re.match(r"^sqlite\+aiosqlite:///(.+)$", url)
    return m.group(1) if m else url


if __name__ == "__main__":
    asyncio.run(migrate_if_needed(_get_db_path()))
