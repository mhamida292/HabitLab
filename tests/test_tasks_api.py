# tests/test_tasks_api.py
import datetime
import pytest
from beaverhabits.storage.dict import DictHabitList


@pytest.fixture
def hl():
    return DictHabitList({"habits": [], "order": []})


def test_tasks_defaults_to_empty(hl):
    assert hl.get_tasks("2026-05-26") == []


def test_add_task_returns_dict_with_required_fields(hl):
    task = hl.add_task("2026-05-26", "Buy milk")
    assert task["text"] == "Buy milk"
    assert task["done"] is False
    assert task["date"] == "2026-05-26"
    assert "id" in task


def test_add_task_strips_whitespace(hl):
    task = hl.add_task("2026-05-26", "  Hello  ")
    assert task["text"] == "Hello"


def test_add_task_persisted_in_data(hl):
    hl.add_task("2026-05-26", "Task A")
    assert len(hl.get_tasks("2026-05-26")) == 1


def test_get_tasks_filters_by_date(hl):
    hl.add_task("2026-05-26", "Today task")
    hl.add_task("2026-05-25", "Yesterday task")
    assert len(hl.get_tasks("2026-05-26")) == 1
    assert hl.get_tasks("2026-05-26")[0]["text"] == "Today task"


def test_get_tasks_carry_forward_undone(hl):
    hl.add_task("2026-05-25", "Undone yesterday")
    tasks = hl.get_tasks("2026-05-26", carry=True)
    assert len(tasks) == 1
    assert tasks[0]["carriedFrom"] == "2026-05-25"


def test_get_tasks_carry_forward_skips_done(hl):
    task = hl.add_task("2026-05-25", "Done yesterday")
    hl.update_task(task["id"], done=True)
    tasks = hl.get_tasks("2026-05-26", carry=True)
    assert tasks == []


def test_get_tasks_carry_forward_deduplicates(hl):
    # Task exists in both yesterday and today's list (already carried manually)
    hl.add_task("2026-05-25", "Undone")
    hl.add_task("2026-05-26", "Today fresh")
    tasks = hl.get_tasks("2026-05-26", carry=True)
    # 1 carried + 1 today = 2 total
    assert len(tasks) == 2


def test_get_tasks_no_carry_without_flag(hl):
    hl.add_task("2026-05-25", "Undone yesterday")
    tasks = hl.get_tasks("2026-05-26", carry=False)
    assert tasks == []


def test_update_task_done(hl):
    task = hl.add_task("2026-05-26", "Do something")
    updated = hl.update_task(task["id"], done=True)
    assert updated["done"] is True


def test_update_task_text(hl):
    task = hl.add_task("2026-05-26", "Old text")
    updated = hl.update_task(task["id"], text="New text")
    assert updated["text"] == "New text"


def test_update_task_returns_none_for_unknown_id(hl):
    assert hl.update_task("nonexistent", done=True) is None


def test_delete_task_removes_it(hl):
    task = hl.add_task("2026-05-26", "Delete me")
    deleted = hl.delete_task(task["id"])
    assert deleted is True
    assert hl.get_tasks("2026-05-26") == []


def test_delete_task_returns_false_for_unknown_id(hl):
    assert hl.delete_task("nonexistent") is False
