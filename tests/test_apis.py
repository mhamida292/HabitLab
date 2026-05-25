import pytest
import datetime
from beaverhabits.storage.dict import DictHabitList, DictHabit
from beaverhabits.routes.api import format_json_response, _record_to_dict


@pytest.fixture
def habit_list():
    """Create a test habit list."""
    hl_data = {"habits": [], "order": []}
    return DictHabitList(hl_data)


@pytest.fixture
def habit_with_sub_goals(habit_list):
    """Create a test habit with sub_goals."""
    sub_goals = [
        {"id": "fajr", "name": "Fajr"},
        {"id": "dhuhr", "name": "Dhuhr"},
        {"id": "asr", "name": "Asr"},
    ]
    data = {
        "name": "Salah",
        "records": [],
        "id": "test-habit-1",
        "tags": [],
        "sub_goals": sub_goals,
        "sub_goal_unit": "prayers",
    }
    return DictHabit(data, habit_list)


def test_format_json_response_includes_sub_goals(habit_with_sub_goals):
    """Test that format_json_response includes sub_goals and sub_goal_unit."""
    response = format_json_response(habit_with_sub_goals)

    assert "sub_goals" in response
    assert "sub_goal_unit" in response
    assert response["sub_goals"] == [
        {"id": "fajr", "name": "Fajr"},
        {"id": "dhuhr", "name": "Dhuhr"},
        {"id": "asr", "name": "Asr"},
    ]
    assert response["sub_goal_unit"] == "prayers"


def test_format_json_response_sub_goals_defaults(habit_list):
    """Test that format_json_response handles default values for sub_goals."""
    data = {
        "name": "Regular Habit",
        "records": [],
        "id": "test-habit-2",
        "tags": [],
    }
    habit = DictHabit(data, habit_list)
    response = format_json_response(habit)

    assert "sub_goals" in response
    assert "sub_goal_unit" in response
    assert response["sub_goals"] == []
    assert response["sub_goal_unit"] == "items"


def test_record_to_dict_includes_sub_goals_done(habit_with_sub_goals):
    """Test that _record_to_dict includes sub_goals_done."""
    import asyncio

    async def tick_and_test():
        day = datetime.date(2026, 5, 24)
        await habit_with_sub_goals.tick(day, count=2)
        record = habit_with_sub_goals.ticked_data[day]
        record.data["sub_goals_done"] = ["fajr", "dhuhr"]

        result = _record_to_dict(record)
        assert "sub_goals_done" in result
        assert result["sub_goals_done"] == ["fajr", "dhuhr"]

    asyncio.run(tick_and_test())


def test_update_habit_sub_goals(habit_with_sub_goals):
    """Test updating habit with sub_goals."""
    new_sub_goals = [
        {"id": "g1", "name": "Goal 1"},
        {"id": "g2", "name": "Goal 2"},
    ]
    new_unit = "steps"

    habit_with_sub_goals.sub_goals = new_sub_goals
    habit_with_sub_goals.sub_goal_unit = new_unit

    assert habit_with_sub_goals.sub_goals == new_sub_goals
    assert habit_with_sub_goals.sub_goal_unit == new_unit

    response = format_json_response(habit_with_sub_goals)
    assert response["sub_goals"] == new_sub_goals
    assert response["sub_goal_unit"] == new_unit
