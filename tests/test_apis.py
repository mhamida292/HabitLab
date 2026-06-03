import pytest
import datetime
from habitlab.storage.dict import DictHabitList, DictHabit
from habitlab.routes.api import format_json_response, _record_to_dict


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


@pytest.mark.asyncio
async def test_tick_sub_goal_id_toggles_sub_goals_done(authed_client, habit):
    """Test that ticking a sub_goal_id toggles the sub-goal's completion state."""
    # Give the habit sub_goals
    sub_goals = [{"id": "fajr", "name": "Fajr"}, {"id": "dhuhr", "name": "Dhuhr"}]
    await authed_client.put(f"/api/v1/habits/{habit['id']}", json={"sub_goals": sub_goals})

    today = datetime.date.today().strftime("%Y-%m-%d")

    # Tick fajr
    resp = await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "fajr"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "fajr" in body["sub_goals_done"]
    assert body["count"] == 1
    assert body["done"] is False  # only 1 of 2 done

    # Tick dhuhr — now both done
    resp2 = await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "dhuhr"},
    )
    body2 = resp2.json()
    assert body2["done"] is True
    assert body2["count"] == 2

    # Untick fajr (toggle off)
    resp3 = await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"date": today, "date_fmt": "%Y-%m-%d", "sub_goal_id": "fajr"},
    )
    body3 = resp3.json()
    assert "fajr" not in body3["sub_goals_done"]
    assert body3["count"] == 1


@pytest.mark.asyncio
async def test_completion_missed_roundtrip(authed_client, habit):
    """POST missed:true marks a day missed; completing it clears the flag."""
    # Mark a day missed
    resp = await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"missed": True, "date": "2026-06-04", "date_fmt": "%Y-%m-%d"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is False
    assert body["count"] == 0
    assert body["missed"] is True

    # GET /habits should report missed: true for that day
    habits = (await authed_client.get("/api/v1/habits")).json()
    target = next(h for h in habits if h["id"] == habit["id"])
    rec = next(r for r in target["records"] if r["day"] == "2026-06-04")
    assert rec["missed"] is True

    # Completing the day clears missed
    await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"done": True, "date": "2026-06-04", "date_fmt": "%Y-%m-%d"},
    )
    habits2 = (await authed_client.get("/api/v1/habits")).json()
    target2 = next(h for h in habits2 if h["id"] == habit["id"])
    rec2 = next(r for r in target2["records"] if r["day"] == "2026-06-04")
    assert rec2["missed"] is False
    assert rec2["done"] is True
