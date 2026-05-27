import datetime
import pytest
from beaverhabits.storage.dict import DictHabitList


@pytest.fixture
def hl():
    return DictHabitList({"habits": []})


def test_today_pinned_default_empty(hl):
    assert hl.today_pinned == []


def test_today_pinned_set_and_get(hl):
    hl.today_pinned = ["abc", "def"]
    assert hl.today_pinned == ["abc", "def"]


def test_today_pinned_persists_in_data(hl):
    hl.today_pinned = ["x"]
    assert hl.data["today_pinned"] == ["x"]


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
