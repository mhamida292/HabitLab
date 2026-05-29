import datetime
import pytest
from habitlab.storage.dict import DictHabitList


@pytest.fixture
def hl():
    return DictHabitList({"habits": []})


def test_default_pins_default_empty(hl):
    assert hl.default_pins == []


def test_default_pins_set_and_get(hl):
    hl.default_pins = ["abc", "def"]
    assert hl.default_pins == ["abc", "def"]


def test_default_pins_persists_in_data(hl):
    hl.default_pins = ["x"]
    assert hl.data["default_pins"] == ["x"]


def test_default_pins_migrates_from_today_pinned():
    hl = DictHabitList({"habits": [], "today_pinned": ["legacy1", "legacy2"]})
    assert hl.default_pins == ["legacy1", "legacy2"]


def test_default_pins_not_clobbered_when_both_keys_present():
    hl = DictHabitList({"habits": [], "today_pinned": ["old"], "default_pins": ["new"]})
    assert hl.default_pins == ["new"]


def test_add_task_returns_task(hl):
    task = hl.add_task("Do laundry", "2026-05-26")
    assert task["text"] == "Do laundry"
    assert task["date"] == "2026-05-26"
    assert task["done"] is False
    assert len(task["id"]) == 8


def test_get_tasks_returns_tasks_for_date(hl):
    hl.add_task("Task A", "2026-05-26")
    hl.add_task("Task B", "2026-05-25")
    tasks = hl.get_tasks("2026-05-26")
    assert len(tasks) == 1
    assert tasks[0]["text"] == "Task A"


def test_update_task_done(hl):
    task = hl.add_task("Toggle me", "2026-05-26")
    updated = hl.update_task(task["id"], done=True)
    assert updated is not None
    assert updated["done"] is True
    assert hl.get_tasks("2026-05-26")[0]["done"] is True


def test_update_task_text(hl):
    task = hl.add_task("Old text", "2026-05-26")
    updated = hl.update_task(task["id"], text="New text")
    assert updated["text"] == "New text"


def test_update_nonexistent_task_returns_none(hl):
    assert hl.update_task("nonexistent", done=True) is None


def test_delete_task(hl):
    task = hl.add_task("Delete me", "2026-05-26")
    deleted = hl.delete_task(task["id"])
    assert deleted is True
    assert hl.get_tasks("2026-05-26") == []


def test_delete_nonexistent_task_returns_false(hl):
    assert hl.delete_task("nonexistent") is False


def test_carry_forward_undone_tasks(hl):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    task = hl.add_task("Carry me", yesterday)

    # Without carry: not visible today
    assert hl.get_tasks(today) == []

    # With carry: appears with carriedFrom set
    carried = hl.get_tasks(today, carry=True)
    assert len(carried) == 1
    assert carried[0]["carriedFrom"] == yesterday


def test_done_tasks_not_carried(hl):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    task = hl.add_task("Done yesterday", yesterday)
    hl.update_task(task["id"], done=True)

    carried = hl.get_tasks(today, carry=True)
    assert carried == []


def test_tasks_older_than_14_days_not_carried(hl):
    today = datetime.date.today().isoformat()
    old = (datetime.date.today() - datetime.timedelta(days=15)).isoformat()
    hl.add_task("Too old", old)

    carried = hl.get_tasks(today, carry=True)
    assert carried == []


def test_tasks_exactly_14_days_old_are_carried(hl):
    today = datetime.date.today().isoformat()
    boundary = (datetime.date.today() - datetime.timedelta(days=14)).isoformat()
    hl.add_task("Boundary task", boundary)

    carried = hl.get_tasks(today, carry=True)
    assert len(carried) == 1
    assert carried[0]["carriedFrom"] == boundary


def test_carry_does_not_duplicate_todays_tasks(hl):
    today = datetime.date.today().isoformat()
    task = hl.add_task("Today task", today)

    results = hl.get_tasks(today, carry=True)
    assert len(results) == 1


def test_day_pins_default_empty(hl):
    assert hl.get_day_pins("2026-06-03") == []


def test_day_pins_set_and_get(hl):
    hl.set_day_pins("2026-06-03", ["journal"])
    assert hl.get_day_pins("2026-06-03") == ["journal"]


def test_day_pins_isolated_per_date(hl):
    hl.set_day_pins("2026-06-03", ["journal"])
    hl.set_day_pins("2026-06-04", ["study"])
    assert hl.get_day_pins("2026-06-03") == ["journal"]
    assert hl.get_day_pins("2026-06-04") == ["study"]


def test_day_pins_empty_list_removes_date_key(hl):
    hl.set_day_pins("2026-06-03", ["journal"])
    hl.set_day_pins("2026-06-03", [])
    assert hl.get_day_pins("2026-06-03") == []
    assert "2026-06-03" not in hl.data.get("day_pins", {})


def test_get_day_pins_returns_copy(hl):
    hl.set_day_pins("2026-06-03", ["journal"])
    got = hl.get_day_pins("2026-06-03")
    got.append("mutated")
    assert hl.get_day_pins("2026-06-03") == ["journal"]
