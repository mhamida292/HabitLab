# tests/test_db.py
import pytest
import habitlab.db as db_module


@pytest.fixture(autouse=True)
async def tmp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr(db_module, "DB_PATH", db_path)
    await db_module.init_db()


@pytest.mark.asyncio
async def test_get_password_hash_returns_none_initially():
    assert await db_module.get_password_hash() is None


@pytest.mark.asyncio
async def test_set_and_get_password_hash():
    await db_module.set_password_hash("$2b$12$fakehash")
    assert await db_module.get_password_hash() == "$2b$12$fakehash"


@pytest.mark.asyncio
async def test_get_habit_list_returns_empty_dict_initially():
    assert await db_module.get_habit_list() == {}


@pytest.mark.asyncio
async def test_save_and_get_habit_list():
    data = {"habits": [{"id": "abc", "name": "Run"}]}
    await db_module.save_habit_list(data)
    assert await db_module.get_habit_list() == data


@pytest.mark.asyncio
async def test_save_habit_list_overwrites_previous():
    await db_module.save_habit_list({"habits": [{"id": "1"}]})
    await db_module.save_habit_list({"habits": [{"id": "2"}]})
    result = await db_module.get_habit_list()
    assert result == {"habits": [{"id": "2"}]}


@pytest.mark.asyncio
async def test_reset_app_clears_password_and_habits():
    await db_module.set_password_hash("$2b$12$fakehash")
    await db_module.save_habit_list({"habits": []})
    await db_module.reset_app()
    assert await db_module.get_password_hash() is None
    assert await db_module.get_habit_list() == {}
