# tests/test_notes_api.py
import pytest
from beaverhabits.storage.dict import DictHabitList


@pytest.fixture
def hl():
    return DictHabitList({"habits": [], "order": []})


def test_notes_defaults_to_empty(hl):
    assert hl.notes == []


def test_add_note_returns_dict_with_required_fields(hl):
    note = hl.add_note("My note", "Some body", habit_id=None)
    assert note["title"] == "My note"
    assert note["body"] == "Some body"
    assert note["habit_id"] is None
    assert "id" in note
    assert "created_at" in note


def test_add_note_blank_title_becomes_untitled(hl):
    note = hl.add_note("", "body")
    assert note["title"] == "Untitled"


def test_add_note_persisted_in_data(hl):
    hl.add_note("First")
    assert len(hl.notes) == 1


def test_get_note_returns_note(hl):
    note = hl.add_note("Test")
    found = hl.get_note(note["id"])
    assert found is not None
    assert found["title"] == "Test"


def test_get_note_returns_none_for_unknown_id(hl):
    assert hl.get_note("nonexistent") is None


def test_delete_note_removes_it(hl):
    note = hl.add_note("Delete me")
    deleted = hl.delete_note(note["id"])
    assert deleted is True
    assert hl.get_note(note["id"]) is None


def test_delete_note_returns_false_for_unknown_id(hl):
    assert hl.delete_note("nonexistent") is False
