from beaverhabits.storage.dict import DictHabitList, DictHabit
import datetime

def make_habit(name="Salah", sub_goals=None):
    sub_goals = sub_goals or [
        {"id": "fajr", "name": "Fajr"},
        {"id": "dhuhr", "name": "Dhuhr"},
    ]
    hl_data = {"habits": [], "order": []}
    hl = DictHabitList(hl_data)
    data = {"name": name, "records": [], "id": "test1", "tags": [], "sub_goals": sub_goals, "sub_goal_unit": "prayers"}
    return DictHabit(data, hl)

def test_sub_goals_property():
    h = make_habit()
    assert h.sub_goals == [{"id": "fajr", "name": "Fajr"}, {"id": "dhuhr", "name": "Dhuhr"}]
    assert h.sub_goal_unit == "prayers"

def test_sub_goals_default_empty():
    hl_data = {"habits": [], "order": []}
    hl = DictHabitList(hl_data)
    data = {"name": "Regular", "records": [], "id": "r1", "tags": []}
    h = DictHabit(data, hl)
    assert h.sub_goals == []
    assert h.sub_goal_unit == "items"

def test_sub_goals_done_on_record():
    h = make_habit()
    day = datetime.date(2026, 5, 24)
    import asyncio
    asyncio.run(h.tick(day, count=1))
    record = h.ticked_data[day]
    record.data["sub_goals_done"] = ["fajr"]
    assert record.sub_goals_done == ["fajr"]
    record.sub_goals_done = ["fajr", "dhuhr"]
    assert record.data["sub_goals_done"] == ["fajr", "dhuhr"]
