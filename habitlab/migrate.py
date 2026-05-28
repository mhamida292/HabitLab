"""One-time migration from BeaverHabits schema to HabitLab schema."""
import shutil
from pathlib import Path

import aiosqlite


async def needs_migration(db_path: str) -> bool:
    """Check if the database has the old BeaverHabits schema (user table exists)."""
    if not Path(db_path).exists():
        return False
    async with aiosqlite.connect(db_path) as db:
        async with db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user'"
        ) as cur:
            return bool(await cur.fetchone())


async def _run_migration(db_path: str) -> None:
    """Perform the schema migration from BeaverHabits to HabitLab."""
    backup = db_path + ".pre-migration.bak"
    shutil.copy2(db_path, backup)
    print(f"  Backed up DB to {backup}")

    async with aiosqlite.connect(db_path) as db:
        # Extract password hash from the old user table
        async with db.execute("SELECT hashed_password FROM user LIMIT 1") as cur:
            row = await cur.fetchone()
            hashed_password = row[0] if row else None

        # Extract habit data from the old habit_list table
        async with db.execute("SELECT data FROM habit_list LIMIT 1") as cur:
            row = await cur.fetchone()
            habit_data = row[0] if row else "{}"

        # Create the new settings table
        await db.execute(
            """
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        # Migrate password hash to the new settings table
        if hashed_password:
            await db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('password_hash', ?)",
                (hashed_password,),
            )

        # Drop the old habit_list table and create the new one
        await db.execute("ALTER TABLE habit_list RENAME TO habit_list_old")
        await db.execute(
            """
            CREATE TABLE habit_list (
                id   INTEGER PRIMARY KEY CHECK (id = 1),
                data TEXT NOT NULL
            )
            """
        )
        # Migrate habit data to the new table
        await db.execute(
            "INSERT INTO habit_list (id, data) VALUES (1, ?)", (habit_data,)
        )

        # Drop old tables
        for table in ("habit_list_old", "user", "user_images", "user_api_tokens"):
            await db.execute(f"DROP TABLE IF EXISTS {table}")

        # Mark migration as complete
        await db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('migrated_v2', 'true')"
        )
        await db.commit()

    print("  Migration complete.")


async def migrate_if_needed(db_path: str) -> None:
    """Run migration if the old schema is detected."""
    if await needs_migration(db_path):
        print(f"Old schema detected in {db_path}. Running migration...")
        await _run_migration(db_path)
