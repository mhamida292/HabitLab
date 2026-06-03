from habitlab.storage.dict import DictHabitList, DictHabit
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

def test_missed_property_defaults_false():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, count=0))
    record = h.ticked_data[day]
    assert record.missed is False

def test_missed_setter_persists():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, count=0))
    record = h.ticked_data[day]
    record.missed = True
    assert record.data["missed"] is True
    assert record.missed is True

def test_tick_marks_missed():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, missed=True))
    record = h.ticked_data[day]
    assert record.count == 0
    assert record.done is False
    assert record.missed is True

def test_tick_done_clears_missed():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, missed=True))
    asyncio.run(h.tick(day, done=True))
    record = h.ticked_data[day]
    assert record.done is True
    assert record.missed is False

def test_tick_clear_resets_to_blank():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, missed=True))
    asyncio.run(h.tick(day, missed=False, done=False))
    record = h.ticked_data[day]
    assert record.count == 0
    assert record.done is False
    assert record.missed is False

def test_tick_positive_count_clears_missed():
    h = make_habit(sub_goals=[])
    import asyncio
    day = datetime.date(2026, 6, 4)
    asyncio.run(h.tick(day, missed=True))
    asyncio.run(h.tick(day, count=1))
    record = h.ticked_data[day]
    assert record.count == 1
    assert record.missed is False
