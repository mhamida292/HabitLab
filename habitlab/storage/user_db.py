# habitlab/storage/user_db.py
from habitlab import db as habitdb
from habitlab.models import User
from habitlab.storage.dict import DictHabitList
from habitlab.storage.storage import UserStorage


class UserDatabaseStorage(UserStorage[DictHabitList]):
    async def get_user_habit_list(self, user: User) -> DictHabitList:
        data = await habitdb.get_habit_list()
        if not data:
            raise Exception("No habit list found")
        return DictHabitList(data)

    async def init_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)

    async def save_user_habit_list(self, user: User, habit_list: DictHabitList) -> None:
        await habitdb.save_habit_list(habit_list.data)
