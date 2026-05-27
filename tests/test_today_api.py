import datetime
import pytest


@pytest.mark.asyncio
async def test_get_tasks_empty(authed_client):
    resp = await authed_client.get("/api/v1/tasks?date=2026-05-26")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_post_task_creates_task(authed_client):
    resp = await authed_client.post(
        "/api/v1/tasks", json={"text": "Test task", "date": "2026-05-26"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["text"] == "Test task"
    assert data["date"] == "2026-05-26"
    assert data["done"] is False
    assert "id" in data


@pytest.mark.asyncio
async def test_post_task_empty_text_rejected(authed_client):
    resp = await authed_client.post(
        "/api/v1/tasks", json={"text": "   ", "date": "2026-05-26"}
    )
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_tasks_invalid_date_rejected(authed_client):
    resp = await authed_client.get("/api/v1/tasks?date=not-a-date")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_task_toggles_done(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Toggle me", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": True})
    assert resp.status_code == 200
    assert resp.json()["done"] is True

    resp2 = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": False})
    assert resp2.json()["done"] is False


@pytest.mark.asyncio
async def test_patch_task_updates_text(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Old text", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"text": "New text"})
    assert resp.status_code == 200
    assert resp.json()["text"] == "New text"


@pytest.mark.asyncio
async def test_patch_nonexistent_task_returns_404(authed_client):
    resp = await authed_client.patch("/api/v1/tasks/nonexistent", json={"done": True})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_task(authed_client):
    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Delete me", "date": "2026-05-26"}
    )
    task_id = create.json()["id"]

    resp = await authed_client.delete(f"/api/v1/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

    get = await authed_client.get("/api/v1/tasks?date=2026-05-26")
    assert all(t["id"] != task_id for t in get.json())


@pytest.mark.asyncio
async def test_delete_nonexistent_task_returns_404(authed_client):
    resp = await authed_client.delete("/api/v1/tasks/nonexistent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_tasks_carry_forward(authed_client):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Carry me", "date": yesterday}
    )
    task_id = create.json()["id"]

    # Without carry — not visible today
    no_carry = await authed_client.get(f"/api/v1/tasks?date={today}")
    assert all(t["id"] != task_id for t in no_carry.json())

    # With carry — visible with carriedFrom
    with_carry = await authed_client.get(f"/api/v1/tasks?date={today}&carry=true")
    carried = [t for t in with_carry.json() if t["id"] == task_id]
    assert len(carried) == 1
    assert carried[0]["carriedFrom"] == yesterday


@pytest.mark.asyncio
async def test_done_tasks_not_carried(authed_client):
    today = datetime.date.today().isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    create = await authed_client.post(
        "/api/v1/tasks", json={"text": "Done task", "date": yesterday}
    )
    task_id = create.json()["id"]
    await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": True})

    resp = await authed_client.get(f"/api/v1/tasks?date={today}&carry=true")
    assert all(t["id"] != task_id for t in resp.json())


@pytest.mark.asyncio
async def test_get_habits_meta_includes_pinned_today_ids(authed_client):
    resp = await authed_client.get("/api/v1/habits/meta")
    assert resp.status_code == 200
    data = resp.json()
    assert "pinned_today_ids" in data
    assert data["pinned_today_ids"] == []


@pytest.mark.asyncio
async def test_put_habits_meta_sets_pinned_today_ids(authed_client, habit):
    resp = await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    assert resp.status_code == 200

    get = await authed_client.get("/api/v1/habits/meta")
    assert habit["id"] in get.json()["pinned_today_ids"]


@pytest.mark.asyncio
async def test_put_habits_meta_order_unaffected_by_pinned_update(authed_client, habit):
    # Set order first
    await authed_client.put("/api/v1/habits/meta", json={"order": [habit["id"]]})
    # Update only pins
    await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["order"] == [habit["id"]]
    assert get.json()["pinned_today_ids"] == [habit["id"]]


@pytest.mark.asyncio
async def test_put_habits_meta_can_clear_pinned(authed_client, habit):
    await authed_client.put(
        "/api/v1/habits/meta", json={"pinned_today_ids": [habit["id"]]}
    )
    await authed_client.put("/api/v1/habits/meta", json={"pinned_today_ids": []})
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["pinned_today_ids"] == []
