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


# ── API integration tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_notes_empty(authed_client):
    resp = await authed_client.get("/api/v1/notes")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_note(authed_client):
    resp = await authed_client.post(
        "/api/v1/notes",
        json={"title": "Test note", "body": "Hello world"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["title"] == "Test note"
    assert data["body"] == "Hello world"
    assert data["habit_id"] is None
    assert "id" in data
    assert "created_at" in data


@pytest.mark.asyncio
async def test_create_note_with_habit_link(authed_client, habit):
    resp = await authed_client.post(
        "/api/v1/notes",
        json={"title": "Linked note", "habit_id": habit["id"]},
    )
    assert resp.status_code == 200
    assert resp.json()["habit_id"] == habit["id"]


@pytest.mark.asyncio
async def test_list_notes_filter_by_habit(authed_client, habit):
    await authed_client.post("/api/v1/notes", json={"title": "General"})
    await authed_client.post(
        "/api/v1/notes",
        json={"title": "Habit note", "habit_id": habit["id"]},
    )
    resp = await authed_client.get(f"/api/v1/notes?habit_id={habit['id']}")
    assert resp.status_code == 200
    notes = resp.json()
    assert len(notes) == 1
    assert notes[0]["title"] == "Habit note"


@pytest.mark.asyncio
async def test_update_note(authed_client):
    create = await authed_client.post("/api/v1/notes", json={"title": "Old title"})
    note_id = create.json()["id"]
    resp = await authed_client.put(
        f"/api/v1/notes/{note_id}",
        json={"title": "New title", "body": "Updated body"},
    )
    assert resp.status_code == 200
    assert resp.json()["title"] == "New title"
    assert resp.json()["body"] == "Updated body"


@pytest.mark.asyncio
async def test_update_note_not_found(authed_client):
    resp = await authed_client.put("/api/v1/notes/nonexistent", json={"title": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_note(authed_client):
    create = await authed_client.post("/api/v1/notes", json={"title": "Bye"})
    note_id = create.json()["id"]
    resp = await authed_client.delete(f"/api/v1/notes/{note_id}")
    assert resp.status_code == 200
    # confirm gone
    list_resp = await authed_client.get("/api/v1/notes")
    assert all(n["id"] != note_id for n in list_resp.json())


@pytest.mark.asyncio
async def test_delete_note_not_found(authed_client):
    resp = await authed_client.delete("/api/v1/notes/nonexistent")
    assert resp.status_code == 404
