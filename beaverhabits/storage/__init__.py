from beaverhabits.storage.storage import UserStorage
from beaverhabits.storage.user_db import UserDatabaseStorage

user_database_storage = UserDatabaseStorage()


def get_user_dict_storage() -> UserStorage:
    return user_database_storage
