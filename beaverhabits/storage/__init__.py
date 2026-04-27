from beaverhabits.storage.images import DatabaseImageStorage
from beaverhabits.storage.storage import UserStorage
from beaverhabits.storage.user_db import UserDatabaseStorage

user_database_storage = UserDatabaseStorage()

# TODO: retrieve image storage backend for each user
image_storage = DatabaseImageStorage()


def get_user_dict_storage() -> UserStorage:
    return user_database_storage
