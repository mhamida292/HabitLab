import asyncio

from beaverhabits.app import crud
from beaverhabits.app.db import User
from beaverhabits.logger import logger
from beaverhabits.storage.dict import DictHabitList
from beaverhabits.storage.storage import UserStorage


def _wrap(value, on_change):
    """Recursively wrap dicts and lists so nested mutations also trigger on_change."""
    if isinstance(value, ObservableDict):
        return value
    if isinstance(value, dict):
        return ObservableDict(value, on_change)
    if isinstance(value, list):
        return ObservableList(value, on_change)
    return value


class ObservableList(list):
    def __init__(self, data, on_change):
        super().__init__(_wrap(v, on_change) for v in data)
        self._on_change = on_change

    def _notify(self):
        self._on_change()

    def __setitem__(self, index, value):
        super().__setitem__(index, _wrap(value, self._on_change))
        self._notify()

    def __delitem__(self, index):
        super().__delitem__(index)
        self._notify()

    def append(self, value):
        super().append(_wrap(value, self._on_change))
        self._notify()

    def insert(self, index, value):
        super().insert(index, _wrap(value, self._on_change))
        self._notify()

    def pop(self, index=-1):
        result = super().pop(index)
        self._notify()
        return result

    def remove(self, value):
        super().remove(value)
        self._notify()

    def clear(self):
        super().clear()
        self._notify()


class ObservableDict(dict):
    def __init__(self, data, on_change):
        super().__init__((_wrap(k, on_change), _wrap(v, on_change)) for k, v in data.items())
        self._on_change = on_change

    def _notify(self):
        self._on_change()

    def __setitem__(self, key, value):
        super().__setitem__(key, _wrap(value, self._on_change))
        self._notify()

    def __delitem__(self, key):
        super().__delitem__(key)
        self._notify()

    def update(self, *args, **kwargs):
        if args:
            other = args[0]
            if hasattr(other, "items"):
                for k, v in other.items():
                    super().__setitem__(k, _wrap(v, self._on_change))
            else:
                for k, v in other:
                    super().__setitem__(k, _wrap(v, self._on_change))
        for k, v in kwargs.items():
            super().__setitem__(k, _wrap(v, self._on_change))
        self._notify()

    def pop(self, key, *args):
        result = super().pop(key, *args)
        self._notify()
        return result

    def clear(self):
        super().clear()
        self._notify()


class DatabasePersistentDict(ObservableDict):

    def __init__(self, user: User, data: dict) -> None:
        self.user = user
        super().__init__(data, on_change=self.backup)

    def backup(self) -> None:
        async def async_backup() -> None:
            try:
                await crud.update_user_habit_list(self.user, dict(self))
            except Exception as e:
                logger.exception(
                    f"[backup]failed to update habit list for user {self.user.email}: {e}"
                )

        try:
            loop = asyncio.get_running_loop()
            loop.create_task(async_backup())
        except RuntimeError:
            raise RuntimeError("No event loop found for scheduling backup")


class UserDatabaseStorage(UserStorage[DictHabitList]):
    async def get_user_habit_list(self, user: User) -> DictHabitList:
        user_habit_list = await crud.get_user_habit_list(user)
        if user_habit_list is None:
            raise Exception(f"User habit list not found for user {user.email}")

        d = DatabasePersistentDict(user, user_habit_list.data)
        return DictHabitList(d)

    async def init_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        user_habit_list = await crud.get_user_habit_list(user)
        if user_habit_list and user_habit_list.data:
            raise Exception(
                f"User habit list already exists for user {user.email}, cannot overwrite"
            )

        await crud.update_user_habit_list(user, habit_list.data)
