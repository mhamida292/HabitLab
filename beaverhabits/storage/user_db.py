from beaverhabits.app import crud
from beaverhabits.app.db import User
from beaverhabits.storage.dict import DictHabitList
from beaverhabits.storage.storage import UserStorage


class UserDatabaseStorage(UserStorage[DictHabitList]):
    """Per-user habit-list storage backed by SQLite/Postgres via SQLAlchemy."""

    async def get_user_habit_list(self, user: User) -> DictHabitList:
        user_habit_list = await crud.get_user_habit_list(user)
        if user_habit_list is None:
            raise Exception(f"User habit list not found for user {user.email}")
        # Plain dict — no auto-backup magic. Endpoints that mutate must call
        # save_user_habit_list() explicitly after their changes so the next
        # request sees fresh state.
        return DictHabitList(dict(user_habit_list.data))

    async def init_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        existing = await crud.get_user_habit_list(user)
        if existing and existing.data:
            raise Exception(
                f"User habit list already exists for user {user.email}, cannot overwrite"
            )
        await crud.update_user_habit_list(user, habit_list.data)

    async def save_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await crud.update_user_habit_list(user, habit_list.data)
