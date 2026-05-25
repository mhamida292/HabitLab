# Detail Panel Redesign + Notes App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the habit detail panel into a full-width two-column layout and add a first-class Notes app with its own sidebar page.

**Architecture:** Notes are stored as a top-level `"notes"` key in the same per-user JSON as habits. The detail panel right column renders sub-goals, weekly trend, and recent notes side-by-side with the calendar. The `/notes` page uses the same split-panel shell as the habits page with a list+editor and grid view toggle.

**Tech Stack:** FastAPI, Jinja2, vanilla JS ES modules, CSS custom properties (no new dependencies)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `beaverhabits/storage/dict.py` | Modify | Add `notes`, `add_note`, `get_note`, `delete_note` to `DictHabitList` |
| `beaverhabits/routes/api.py` | Modify | Add 4 notes CRUD endpoints |
| `beaverhabits/routes/pages.py` | Modify | Add `/notes` page route |
| `beaverhabits/templates/base.html` | Modify | Add notes icon to nav rail |
| `beaverhabits/templates/notes.html` | Create | Notes page template |
| `beaverhabits/static/js/notes-page.js` | Create | Notes page logic (fetch, CRUD, view toggle) |
| `beaverhabits/static/css/styles.css` | Modify | Notes page styles + detail panel two-column styles |
| `beaverhabits/templates/index.html` | Modify | Restructure `#detailContent` into two columns |
| `beaverhabits/static/js/habits.js` | Modify | Trend chart, sub-goals section, recent notes section |
| `tests/test_notes_api.py` | Create | Notes CRUD API tests |

---

## Task 1: Notes storage layer

**Files:**
- Modify: `beaverhabits/storage/dict.py`
- Test: `tests/test_notes_api.py`

- [ ] **Step 1.1: Write failing tests for notes storage**

```python
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
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
.venv/bin/pytest tests/test_notes_api.py -v 2>&1 | head -30
```

Expected: `AttributeError: 'DictHabitList' object has no attribute 'notes'`

- [ ] **Step 1.3: Add notes methods to `DictHabitList`**

Open `beaverhabits/storage/dict.py`. Find the `class DictHabitList` definition (around line 334). Add these methods at the end of the class, before any existing `async def merge`:

```python
    @property
    def notes(self) -> list[dict]:
        return self.data.setdefault("notes", [])

    def add_note(self, title: str, body: str = "", habit_id: str | None = None) -> dict:
        import datetime
        from beaverhabits.utils import generate_short_hash
        note = {
            "id": generate_short_hash((title or "Untitled") + str(datetime.datetime.now())),
            "title": title.strip() or "Untitled",
            "body": body,
            "habit_id": habit_id,
            "created_at": datetime.datetime.now().isoformat(timespec="seconds"),
        }
        self.data.setdefault("notes", []).append(note)
        return note

    def get_note(self, note_id: str) -> dict | None:
        return next((n for n in self.notes if n["id"] == note_id), None)

    def delete_note(self, note_id: str) -> bool:
        notes = self.data.setdefault("notes", [])
        before = len(notes)
        self.data["notes"] = [n for n in notes if n["id"] != note_id]
        return len(self.data["notes"]) < before
```

- [ ] **Step 1.4: Run tests to verify they pass**

```bash
.venv/bin/pytest tests/test_notes_api.py::test_notes_defaults_to_empty tests/test_notes_api.py::test_add_note_returns_dict_with_required_fields tests/test_notes_api.py::test_add_note_blank_title_becomes_untitled tests/test_notes_api.py::test_add_note_persisted_in_data tests/test_notes_api.py::test_get_note_returns_note tests/test_notes_api.py::test_get_note_returns_none_for_unknown_id tests/test_notes_api.py::test_delete_note_removes_it tests/test_notes_api.py::test_delete_note_returns_false_for_unknown_id -v
```

Expected: all 8 PASS

- [ ] **Step 1.5: Commit**

```bash
git add beaverhabits/storage/dict.py tests/test_notes_api.py
git commit -m "feat: add notes storage layer to DictHabitList"
```

---

## Task 2: Notes API endpoints

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_notes_api.py`

- [ ] **Step 2.1: Write failing API tests**

Append to `tests/test_notes_api.py`:

```python
import pytest


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
```

- [ ] **Step 2.2: Run tests to verify they fail**

```bash
.venv/bin/pytest tests/test_notes_api.py::test_list_notes_empty -v
```

Expected: `404 Not Found` (route doesn't exist yet)

- [ ] **Step 2.3: Add notes endpoints to `beaverhabits/routes/api.py`**

Find the line `def init_api_routes(app: FastAPI) -> None:` (last function). Add the following before it — right after the `/seed/sample-data` endpoint:

```python
# ── Notes ─────────────────────────────────────────────────────────────────────

class CreateNote(BaseModel):
    title: str
    body: str = ""
    habit_id: str | None = None


class UpdateNote(BaseModel):
    title: str | None = None
    body: str | None = None
    habit_id: str | None = None


@api_router.get("/notes", tags=["notes"])
async def get_notes(
    habit_id: str | None = None,
    habit_list: HabitList = Depends(current_habit_list),
):
    notes = sorted(habit_list.notes, key=lambda n: n.get("created_at", ""), reverse=True)
    if habit_id:
        notes = [n for n in notes if n.get("habit_id") == habit_id]
    return notes


@api_router.post("/notes", tags=["notes"])
async def post_note(
    note: CreateNote,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    created = habit_list.add_note(note.title, note.body, note.habit_id)
    await _storage.save_user_habit_list(user, habit_list)
    return created


@api_router.put("/notes/{note_id}", tags=["notes"])
async def put_note(
    note_id: str,
    note: UpdateNote,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    existing = habit_list.get_note(note_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Note not found")
    if note.title is not None:
        existing["title"] = note.title.strip() or "Untitled"
    if note.body is not None:
        existing["body"] = note.body
    if note.habit_id is not None:
        existing["habit_id"] = note.habit_id if note.habit_id != "" else None
    await _storage.save_user_habit_list(user, habit_list)
    return existing


@api_router.delete("/notes/{note_id}", tags=["notes"])
async def delete_note_route(
    note_id: str,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    deleted = habit_list.delete_note(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    await _storage.save_user_habit_list(user, habit_list)
    return {"ok": True}
```

- [ ] **Step 2.4: Run all notes API tests**

```bash
.venv/bin/pytest tests/test_notes_api.py -v
```

Expected: all 16 tests PASS

- [ ] **Step 2.5: Run full test suite to check for regressions**

```bash
.venv/bin/pytest --tb=short -q
```

Expected: all passing, no regressions

- [ ] **Step 2.6: Commit**

```bash
git add beaverhabits/routes/api.py tests/test_notes_api.py
git commit -m "feat: add notes CRUD API endpoints"
```

---

## Task 3: Notes page — route, template, nav icon

**Files:**
- Modify: `beaverhabits/routes/pages.py`
- Modify: `beaverhabits/templates/base.html`
- Create: `beaverhabits/templates/notes.html`

- [ ] **Step 3.1: Add `/notes` route to `pages.py`**

Inside `init_page_routes`, after the `/heatmap/{habit_id}` route, add:

```python
    @app.get("/notes", response_class=HTMLResponse)
    async def notes_page(request: Request):
        return templates.TemplateResponse(
            "notes.html", {"request": request}, headers=NO_CACHE_HEADERS
        )
```

- [ ] **Step 3.2: Add notes icon to nav rail in `base.html`**

Find this block in `base.html`:
```html
        <a href="/stats" class="nav-item {% block nav_stats %}{% endblock %}" title="Stats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </a>
        <div class="nav-spacer"></div>
```

Replace with:
```html
        <a href="/stats" class="nav-item {% block nav_stats %}{% endblock %}" title="Stats">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        </a>
        <a href="/notes" class="nav-item {% block nav_notes %}{% endblock %}" title="Notes">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </a>
        <div class="nav-spacer"></div>
```

- [ ] **Step 3.3: Create `beaverhabits/templates/notes.html`**

```html
{% extends "base.html" %}
{% block title %}Notes — HabitLab{% endblock %}
{% block nav_notes %}active{% endblock %}

{% block panels %}
<div class="notes-page" id="notesPage">

    <!-- Header -->
    <div class="notes-header">
        <div class="notes-header-title">Notes</div>
        <div class="view-toggle" id="viewToggle">
            <button class="view-toggle-btn" id="viewListBtn" title="List view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button class="view-toggle-btn" id="viewGridBtn" title="Grid view">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
        </div>
        <button class="ibtn" id="notesNewBtn" title="New note" style="margin-left:4px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
    </div>

    <!-- Habit filter chips -->
    <div class="notes-filter-bar" id="notesFilterBar"></div>

    <!-- Dynamic content area (list split or grid) -->
    <div id="notesMain"></div>

</div>
{% endblock %}

{% block scripts %}
<script type="module" src="/static/js/notes-page.js?v={{ asset_version }}"></script>
{% endblock %}
```

- [ ] **Step 3.4: Verify the page loads**

Start the dev server:
```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
.venv/bin/python -m uvicorn beaverhabits.main:app --reload --port 8080 &
```

Open `http://localhost:8080/notes` in a browser. Expected: page loads without error (blank content is fine — JS not written yet). The notes icon appears in the nav rail, highlighted as active.

Kill server after verifying: `kill %1`

- [ ] **Step 3.5: Commit**

```bash
git add beaverhabits/routes/pages.py beaverhabits/templates/base.html beaverhabits/templates/notes.html
git commit -m "feat: add /notes route, nav icon, and page template"
```

---

## Task 4: Notes page CSS

**Files:**
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 4.1: Append notes page styles to `styles.css`**

Add at the very end of `beaverhabits/static/css/styles.css`:

```css
/* ── Notes page ──────────────────────────────────────────────────────────── */
.notes-page {
    display: flex; flex-direction: column;
    flex: 1; overflow: hidden;
}
.notes-header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--border);
    background: var(--bg-surface); flex-shrink: 0;
}
.notes-header-title { font-size: 15px; font-weight: 700; color: var(--text-primary); flex: 1; }

.view-toggle {
    display: flex; gap: 1px;
    background: var(--bg-elevated); border-radius: 6px; padding: 2px;
}
.view-toggle-btn {
    width: 28px; height: 28px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all var(--transition);
}
.view-toggle-btn.active {
    background: var(--bg-surface); color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,.18);
}

.notes-filter-bar {
    display: flex; gap: 6px; padding: 7px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-surface); overflow-x: auto; flex-shrink: 0;
}
.notes-chip {
    padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600;
    background: var(--bg-elevated); color: var(--text-secondary);
    border: 1px solid transparent; cursor: pointer; white-space: nowrap;
    transition: all var(--transition); flex-shrink: 0;
}
.notes-chip.active {
    background: var(--accent-sel); color: var(--accent-light);
    border-color: var(--accent);
}

/* ── List view ── */
#notesMain { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.notes-list-split { display: flex; flex: 1; min-height: 0; overflow: hidden; }

.notes-list-col {
    width: 240px; flex-shrink: 0;
    border-right: 1px solid var(--border); overflow-y: auto;
}
.note-list-item {
    padding: 10px 14px; border-bottom: 1px solid var(--border);
    cursor: pointer; transition: background var(--transition);
}
.note-list-item:hover { background: var(--bg-elevated); }
.note-list-item.selected {
    background: var(--accent-sel);
    border-left: 2px solid var(--accent); padding-left: 12px;
}
.note-list-title {
    font-size: 12px; font-weight: 600; color: var(--text-primary);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.note-list-meta { display: flex; align-items: center; gap: 6px; margin-top: 2px; }
.note-list-date { font-size: 10px; color: var(--text-muted); }
.note-habit-pill {
    font-size: 9px; font-weight: 700; background: #14532d22;
    color: #4ade80; border-radius: 4px; padding: 1px 5px;
}
.note-list-preview {
    font-size: 11px; color: var(--text-secondary); margin-top: 2px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* ── Editor ── */
.notes-editor-col {
    flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden;
}
.note-editor-header {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.note-editor-title {
    flex: 1; font-size: 15px; font-weight: 700; color: var(--text-primary);
    border: none; outline: none; background: transparent;
}
.note-editor-delete {
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; padding: 4px; border-radius: 4px;
    transition: color var(--transition); line-height: 1;
}
.note-editor-delete:hover { color: #ef4444; }
.note-editor-meta {
    display: flex; align-items: center; gap: 12px; flex-shrink: 0;
    padding: 6px 16px; border-bottom: 1px solid var(--border);
    font-size: 11px; color: var(--text-muted);
}
.note-habit-select {
    font-size: 11px; font-weight: 600; color: var(--accent-light);
    background: var(--accent-sel); border: 1px solid var(--accent);
    border-radius: 5px; padding: 2px 8px; cursor: pointer; outline: none;
}
.note-editor-body {
    flex: 1; padding: 14px 16px; font-size: 13px; color: var(--text-primary);
    line-height: 1.7; resize: none; border: none; outline: none;
    background: transparent; font-family: inherit; overflow-y: auto;
}
.notes-editor-empty {
    flex: 1; display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 13px;
}

/* ── Grid view ── */
.notes-grid {
    flex: 1; padding: 12px 16px; overflow-y: auto;
    display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 10px; align-content: start;
}
.note-card {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 12px; cursor: pointer;
    transition: border-color var(--transition), box-shadow var(--transition);
}
.note-card:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.12); }
.note-card-title { font-size: 12px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.note-card-body {
    font-size: 11px; color: var(--text-secondary); line-height: 1.5;
    max-height: 48px; overflow: hidden;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
}
.note-card-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
.note-card-date { font-size: 9px; color: var(--text-muted); }
.note-card-add {
    border: 1px dashed var(--border); background: transparent;
    border-radius: 10px; display: flex; align-items: center; justify-content: center;
    font-size: 12px; color: var(--text-muted); cursor: pointer; min-height: 80px;
    transition: all var(--transition); width: 100;
}
.note-card-add:hover { border-color: var(--accent); color: var(--accent); }

/* ── Empty state ── */
.notes-empty {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px; color: var(--text-muted);
}
.notes-empty svg { opacity: 0.25; }
.notes-empty p { font-size: 14px; }

/* ── Mobile notes ── */
@media (max-width: 767px) {
    .notes-list-col { width: 100%; border-right: none; }
    .notes-editor-col { display: none; width: 100%; }
    .notes-list-col.mobile-hide { display: none; }
    .notes-editor-col.mobile-show { display: flex; }
    .notes-grid { grid-template-columns: 1fr 1fr; }
}

/* ── Detail panel two-column layout ─────────────────────────────────────── */
.detail-columns {
    display: flex; flex: 1; min-height: 0; overflow: hidden;
}
.detail-col-left {
    flex: 1; min-width: 0; padding: 0 0 16px 0; overflow-y: auto;
}
.detail-col-right {
    flex: 1; min-width: 0; overflow-y: auto;
    border-left: 1px solid var(--border);
    padding: 16px 20px;
    display: flex; flex-direction: column; gap: 20px;
}
.detail-section-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-muted); margin-bottom: 8px;
}

/* Inset calendar */
.cal-section { padding: 12px 16px 8px; }
.cal-inset {
    background: var(--bg-elevated); border-radius: 10px; padding: 10px 12px;
}

/* Trend chart */
.trend-bars { display: flex; align-items: flex-end; gap: 4px; height: 64px; }
.trend-bar {
    flex: 1; background: var(--accent); border-radius: 3px 3px 0 0;
    opacity: 0.45; min-height: 3px; transition: opacity var(--transition);
}
.trend-bar:hover { opacity: 0.7; }
.trend-bar.current { opacity: 1; }
.trend-bar-labels { display: flex; gap: 4px; margin-top: 4px; }
.trend-bar-lbl { flex: 1; text-align: center; font-size: 9px; color: var(--text-muted); }
.trend-bar-lbl.current { color: var(--accent-light); font-weight: 700; }

/* Sub-goals in detail panel */
.detail-sg-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
.detail-sg-check {
    width: 14px; height: 14px; border-radius: 3px;
    border: 2px solid var(--border); flex-shrink: 0; cursor: pointer;
    transition: all var(--transition); display: flex; align-items: center; justify-content: center;
}
.detail-sg-check.done { background: var(--accent); border-color: var(--accent); }
.detail-sg-name { font-size: 12px; color: var(--text-primary); }
.detail-sg-name.done { color: var(--text-muted); text-decoration: line-through; }
.detail-sg-progress { height: 3px; background: var(--border); border-radius: 2px; margin-top: 6px; overflow: hidden; }
.detail-sg-progress-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width .3s ease; }

/* Recent notes in detail panel */
.detail-note-item {
    padding: 8px 10px; background: var(--bg-surface);
    border: 1px solid var(--border); border-radius: 8px;
    cursor: pointer; transition: border-color var(--transition); margin-bottom: 4px;
}
.detail-note-item:hover { border-color: var(--accent); }
.detail-note-date { font-size: 10px; color: var(--text-muted); margin-bottom: 2px; }
.detail-note-title {
    font-size: 12px; color: var(--text-primary); font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-notes-add {
    border: 1px dashed var(--border); border-radius: 8px; padding: 6px 10px;
    font-size: 12px; color: var(--text-muted); text-align: center;
    cursor: pointer; transition: all var(--transition);
    background: transparent; width: 100%; margin-top: 4px;
}
.detail-notes-add:hover { border-color: var(--accent); color: var(--accent-light); }

/* Detail panel stat-grid override (2x2 in left col) */
.detail-col-left .stat-grid {
    grid-template-columns: repeat(2, 1fr);
    padding: 16px 16px 0;
}

/* Mobile detail panel */
@media (max-width: 767px) {
    .detail-columns { flex-direction: column; overflow-y: auto; }
    .detail-col-left { padding-bottom: 0; overflow-y: visible; }
    .detail-col-right {
        border-left: none; border-top: 1px solid var(--border);
        padding: 16px;
    }
}
```

- [ ] **Step 4.2: Commit**

```bash
git add beaverhabits/static/css/styles.css
git commit -m "feat: add notes page and detail panel CSS"
```

---

## Task 5: Notes page JavaScript

**Files:**
- Create: `beaverhabits/static/js/notes-page.js`

- [ ] **Step 5.1: Create `beaverhabits/static/js/notes-page.js`**

```javascript
// beaverhabits/static/js/notes-page.js
import { api, toast } from '/static/js/api.js';

// ── State ──────────────────────────────────────────────────────────────────
let state = {
    notes: [],       // all notes, newest-first
    habits: [],      // all habits (for filter chips + selector)
    selectedId: null,
    filterHabitId: null,
    view: localStorage.getItem('notes-view') || 'list',
};

// Auto-save debounce
let saveTimer = null;

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
    // Check for ?new=1&habit_id=X in URL
    const params = new URLSearchParams(location.search);

    // Fetch habits and notes in parallel
    const [habitsData, notesData] = await Promise.all([
        api.get('/api/v1/habits'),
        api.get('/api/v1/notes'),
    ]);
    state.habits = habitsData;
    state.notes = notesData;

    setView(state.view, false);
    renderFilters();
    renderMain();

    // Bind header buttons
    document.getElementById('notesNewBtn').addEventListener('click', () => createNote());
    document.getElementById('viewListBtn').addEventListener('click', () => setView('list'));
    document.getElementById('viewGridBtn').addEventListener('click', () => setView('grid'));

    // Auto-create if ?new=1
    if (params.get('new') === '1') {
        const habitId = params.get('habit_id') || null;
        await createNote(habitId);
        history.replaceState({}, '', '/notes');
    }
}

// ── View toggle ────────────────────────────────────────────────────────────
function setView(v, render = true) {
    state.view = v;
    localStorage.setItem('notes-view', v);
    document.getElementById('viewListBtn').classList.toggle('active', v === 'list');
    document.getElementById('viewGridBtn').classList.toggle('active', v === 'grid');
    if (render) renderMain();
}

// ── Filter chips ───────────────────────────────────────────────────────────
function renderFilters() {
    const bar = document.getElementById('notesFilterBar');
    // Only show habits that have at least one linked note
    const linkedIds = new Set(state.notes.map(n => n.habit_id).filter(Boolean));
    const linkedHabits = state.habits.filter(h => linkedIds.has(h.id));

    bar.innerHTML = '';
    const allChip = el('button', { class: 'notes-chip' + (state.filterHabitId === null ? ' active' : ''), onclick: () => applyFilter(null) }, 'All');
    bar.appendChild(allChip);

    for (const h of linkedHabits) {
        const chip = el('button', {
            class: 'notes-chip' + (state.filterHabitId === h.id ? ' active' : ''),
            onclick: () => applyFilter(h.id),
        }, (h.icon || '') + ' ' + h.name);
        bar.appendChild(chip);
    }
}

function applyFilter(habitId) {
    state.filterHabitId = habitId;
    state.selectedId = null;
    renderFilters();
    renderMain();
}

// ── Filtered notes ─────────────────────────────────────────────────────────
function filteredNotes() {
    if (!state.filterHabitId) return state.notes;
    return state.notes.filter(n => n.habit_id === state.filterHabitId);
}

// ── Main render ────────────────────────────────────────────────────────────
function renderMain() {
    const main = document.getElementById('notesMain');
    main.innerHTML = '';

    if (state.view === 'list') {
        renderListView(main);
    } else {
        renderGridView(main);
    }
}

// ── List view ──────────────────────────────────────────────────────────────
function renderListView(container) {
    const notes = filteredNotes();
    const split = el('div', { class: 'notes-list-split' });

    // Left: list
    const listCol = el('div', { class: 'notes-list-col', id: 'notesListCol' });
    if (notes.length === 0) {
        listCol.appendChild(el('div', { style: 'padding:20px;color:var(--text-muted);font-size:12px;text-align:center' }, 'No notes yet'));
    } else {
        for (const note of notes) {
            listCol.appendChild(makeListItem(note));
        }
    }
    split.appendChild(listCol);

    // Right: editor
    const editorCol = el('div', { class: 'notes-editor-col', id: 'notesEditorCol' });
    const selected = notes.find(n => n.id === state.selectedId);
    if (selected) {
        renderEditor(editorCol, selected);
    } else {
        editorCol.appendChild(el('div', { class: 'notes-editor-empty' }, 'Select a note or create one'));
    }
    split.appendChild(editorCol);
    container.appendChild(split);
}

function makeListItem(note) {
    const habit = state.habits.find(h => h.id === note.habit_id);
    const item = el('div', {
        class: 'note-list-item' + (note.id === state.selectedId ? ' selected' : ''),
        onclick: () => selectNote(note.id),
    });
    item.appendChild(el('div', { class: 'note-list-title' }, note.title || 'Untitled'));
    const meta = el('div', { class: 'note-list-meta' });
    if (habit) meta.appendChild(el('span', { class: 'note-habit-pill' }, (habit.icon || '') + ' ' + habit.name));
    meta.appendChild(el('span', { class: 'note-list-date' }, fmtDate(note.created_at)));
    item.appendChild(meta);
    if (note.body) item.appendChild(el('div', { class: 'note-list-preview' }, note.body));
    return item;
}

function selectNote(id) {
    state.selectedId = id;
    // On mobile: show editor, hide list
    const listCol = document.getElementById('notesListCol');
    const editorCol = document.getElementById('notesEditorCol');
    if (listCol && editorCol) {
        const isMobile = window.innerWidth <= 767;
        if (isMobile) {
            listCol.classList.add('mobile-hide');
            editorCol.classList.add('mobile-show');
        }
        // Re-render editor in place
        const note = state.notes.find(n => n.id === id);
        if (note) renderEditor(editorCol, note);
        // Highlight selected item
        document.querySelectorAll('.note-list-item').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.note-list-item').forEach(el => {
            if (el.onclick?.toString().includes(id)) el.classList.add('selected');
        });
        // Re-render list to update selection highlight properly
        renderMain();
    }
}

// ── Editor ─────────────────────────────────────────────────────────────────
function renderEditor(container, note) {
    container.innerHTML = '';

    // Header
    const header = el('div', { class: 'note-editor-header' });
    const titleInput = el('input', {
        class: 'note-editor-title',
        type: 'text',
        value: note.title,
        placeholder: 'Untitled',
    });
    titleInput.addEventListener('input', () => scheduleSave(note.id, { title: titleInput.value }));
    header.appendChild(titleInput);

    const delBtn = el('button', { class: 'note-editor-delete', title: 'Delete note', onclick: () => deleteNote(note.id) });
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
    header.appendChild(delBtn);
    container.appendChild(header);

    // Meta bar
    const meta = el('div', { class: 'note-editor-meta' });
    meta.appendChild(el('span', {}, '📅 ' + fmtDate(note.created_at)));

    const habitSel = el('select', { class: 'note-habit-select' });
    const noneOpt = el('option', { value: '' }, 'No habit');
    if (!note.habit_id) noneOpt.selected = true;
    habitSel.appendChild(noneOpt);
    for (const h of state.habits) {
        const opt = el('option', { value: h.id }, (h.icon || '') + ' ' + h.name);
        if (h.id === note.habit_id) opt.selected = true;
        habitSel.appendChild(opt);
    }
    habitSel.addEventListener('change', () => scheduleSave(note.id, { habit_id: habitSel.value || '' }));
    meta.appendChild(habitSel);
    container.appendChild(meta);

    // Body
    const body = el('textarea', {
        class: 'note-editor-body',
        placeholder: 'Write something...',
    });
    body.value = note.body || '';
    body.addEventListener('input', () => scheduleSave(note.id, { body: body.value }));
    container.appendChild(body);

    // Back button for mobile
    if (window.innerWidth <= 767) {
        const backBtn = el('button', {
            class: 'ibtn',
            style: 'position:absolute;top:8px;left:8px;',
            onclick: () => {
                state.selectedId = null;
                renderMain();
            },
        });
        backBtn.textContent = '← Back';
        header.prepend(backBtn);
    }
}

// ── Grid view ──────────────────────────────────────────────────────────────
function renderGridView(container) {
    const notes = filteredNotes();
    const grid = el('div', { class: 'notes-grid' });

    if (notes.length === 0) {
        const empty = el('div', { class: 'notes-empty', style: 'grid-column:1/-1' });
        empty.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        empty.appendChild(el('p', {}, 'No notes yet'));
        grid.appendChild(empty);
    } else {
        for (const note of notes) {
            grid.appendChild(makeCard(note));
        }
    }

    // Add card
    const addCard = el('button', { class: 'note-card note-card-add', onclick: () => createNote() }, '+ New note');
    grid.appendChild(addCard);
    container.appendChild(grid);
}

function makeCard(note) {
    const habit = state.habits.find(h => h.id === note.habit_id);
    const card = el('div', { class: 'note-card', onclick: () => openCardEditor(note.id) });
    card.appendChild(el('div', { class: 'note-card-title' }, note.title || 'Untitled'));
    if (note.body) card.appendChild(el('div', { class: 'note-card-body' }, note.body));
    const foot = el('div', { class: 'note-card-footer' });
    foot.appendChild(el('span', { class: 'note-card-date' }, fmtDate(note.created_at)));
    if (habit) foot.appendChild(el('span', { class: 'note-habit-pill' }, (habit.icon || '') + ' ' + habit.name));
    card.appendChild(foot);
    return card;
}

function openCardEditor(id) {
    // Switch to list view, select the note
    setView('list', false);
    state.selectedId = id;
    renderFilters();
    renderMain();
}

// ── CRUD ───────────────────────────────────────────────────────────────────
async function createNote(habitId = null) {
    try {
        const note = await api.post('/api/v1/notes', {
            title: '',
            body: '',
            habit_id: habitId,
        });
        state.notes.unshift(note);
        state.selectedId = note.id;
        if (state.view === 'grid') setView('list', false);
        renderFilters();
        renderMain();
        // Focus title input
        setTimeout(() => document.querySelector('.note-editor-title')?.focus(), 50);
    } catch (e) {
        toast('Failed to create note', 'error');
    }
}

function scheduleSave(noteId, patch) {
    // Update local state immediately
    const note = state.notes.find(n => n.id === noteId);
    if (note) Object.assign(note, patch);
    // Debounce API call
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistNote(noteId, patch), 600);
}

async function persistNote(noteId, patch) {
    try {
        await api.put(`/api/v1/notes/${noteId}`, patch);
        renderFilters(); // habit filter chips may need to update
    } catch (e) {
        toast('Failed to save note', 'error');
    }
}

async function deleteNote(id) {
    try {
        await api.delete(`/api/v1/notes/${id}`);
        state.notes = state.notes.filter(n => n.id !== id);
        state.selectedId = null;
        renderFilters();
        renderMain();
        toast('Note deleted');
    } catch (e) {
        toast('Failed to delete note', 'error');
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function el(tag, attrs = {}, text = null) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'onclick') e.addEventListener('click', v);
        else if (k === 'class') e.className = v;
        else if (k === 'value' && (tag === 'input' || tag === 'textarea')) e.value = v;
        else if (k === 'selected') e.selected = v;
        else e.setAttribute(k, v);
    }
    if (text !== null) e.textContent = text;
    return e;
}

function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
init().catch(console.error);
```

- [ ] **Step 5.2: Verify `api.js` has a `delete` method**

```bash
grep -n "delete\|\.delete\b" "/home/mhamida/Desktop/Projects/Software Dev/habitlab/beaverhabits/static/js/api.js"
```

If there is no `delete` method, add it. Open `api.js` and find the `api` object. Add:

```javascript
delete: (url) => fetch(url, { method: 'DELETE', headers }).then(r => r.ok ? r.json() : Promise.reject(r)),
```

- [ ] **Step 5.3: Smoke test the notes page end-to-end**

Start the dev server and open `http://localhost:8080/notes`:
```bash
.venv/bin/python -m uvicorn beaverhabits.main:app --reload --port 8080
```

Verify:
1. Page loads, shows "No notes yet"
2. Click "+ New" — a blank note appears, title field is focused
3. Type a title and body — content auto-saves (check Network tab: PUT /api/v1/notes/{id})
4. Reload page — note persists
5. Click the delete (trash) icon — note disappears, toast shows
6. Click ⊞ toggle — grid view renders
7. Click ☰ toggle — list+editor renders
8. Reload — view preference is remembered

- [ ] **Step 5.4: Commit**

```bash
git add beaverhabits/static/js/notes-page.js beaverhabits/static/js/api.js
git commit -m "feat: notes page JS — list+editor and grid views, CRUD, view toggle"
```

---

## Task 6: Detail panel HTML restructure

**Files:**
- Modify: `beaverhabits/templates/index.html`

- [ ] **Step 6.1: Replace `#detailContent` in `index.html`**

Find and replace the entire `<!-- Populated detail -->` block (lines 44–69 roughly). Replace with:

```html
    <!-- Populated detail (hidden until habit selected) -->
    <div id="detailContent" style="display:none">
        <!-- Header -->
        <div class="detail-header">
            <div class="detail-icon" id="detailIcon">📌</div>
            <div class="detail-title" id="detailTitle">—</div>
            <button class="ibtn detail-more" id="detailMore" title="Edit / Archive / Delete">···</button>
        </div>

        <!-- Two-column body -->
        <div class="detail-columns">

            <!-- Left: stats + calendar -->
            <div class="detail-col-left" id="detailLeft">
                <!-- 4 stat cards (2×2) -->
                <div class="stat-grid" id="statGrid">
                    <div class="stat-card"><div class="stat-val" id="statMonthlyCheckins">—</div><div class="stat-lbl">Monthly check-ins</div></div>
                    <div class="stat-card"><div class="stat-val" id="statTotalCheckins">—</div><div class="stat-lbl">Total check-ins</div></div>
                    <div class="stat-card"><div class="stat-val" id="statMonthlyRate">—</div><div class="stat-lbl">Monthly rate</div></div>
                    <div class="stat-card"><div class="stat-val streak" id="statStreak">—</div><div class="stat-lbl">Current streak</div></div>
                </div>

                <!-- Inset calendar -->
                <div class="cal-section">
                    <div class="cal-section-title">Monthly view</div>
                    <div class="cal-inset">
                        <div id="calContainer"></div>
                    </div>
                </div>
            </div>

            <!-- Right: sub-goals, trend, notes -->
            <div class="detail-col-right" id="detailRight">

                <!-- Sub-goals (hidden for habits without sub-goals) -->
                <div id="detailSubGoals" style="display:none">
                    <div class="detail-section-label">Sub-goals · today</div>
                    <div id="sgTodayList"></div>
                    <div class="detail-sg-progress"><div class="detail-sg-progress-fill" id="sgProgressFill"></div></div>
                </div>

                <!-- Weekly trend -->
                <div id="detailTrend">
                    <div class="detail-section-label">Weekly trend</div>
                    <div class="trend-bars" id="trendBars"></div>
                    <div class="trend-bar-labels" id="trendLabels"></div>
                </div>

                <!-- Recent notes -->
                <div id="detailNotes">
                    <div class="detail-section-label">Notes</div>
                    <div id="detailNotesList"></div>
                    <button class="detail-notes-add" id="detailNotesAdd">+ Add note</button>
                </div>

            </div>
        </div>
    </div>
```

- [ ] **Step 6.2: Commit**

```bash
git add beaverhabits/templates/index.html
git commit -m "feat: restructure detail panel into two-column layout"
```

---

## Task 7: Detail panel JavaScript

**Files:**
- Modify: `beaverhabits/static/js/habits.js`

- [ ] **Step 7.1: Remove dead stat references**

In `habits.js`, find all lines that reference `statMonthlyCompletion` and `statTotalCompletion` (there are two sets — one in `showDetail` and one in `refreshDetailStats`). Delete those lines. Example — find and remove:

```javascript
document.getElementById('statMonthlyCompletion').textContent = stats.monthly_completion;
document.getElementById('statTotalCompletion').textContent  = stats.total_completion;
```

Both occurrences must be removed (they appear in two different functions).

- [ ] **Step 7.2: Add `computeWeeklyTrend` function**

Add this function near the top of the module (after the imports):

```javascript
/**
 * Compute 8-week check-in rate buckets from a records array.
 * Returns [{pct: 0.0-1.0, isCurrent: bool}, ...] oldest-first.
 */
function computeWeeklyTrend(records, weeks = 8) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const doneSet = new Set(
        records.filter(r => r.done).map(r => r.day)
    );

    // Find the Monday of the current week
    const dayOfWeek = today.getDay(); // 0=Sun
    const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - daysFromMon);

    const result = [];
    for (let w = weeks - 1; w >= 0; w--) {
        const weekMonday = new Date(currentMonday);
        weekMonday.setDate(currentMonday.getDate() - w * 7);
        const weekSunday = new Date(weekMonday);
        weekSunday.setDate(weekMonday.getDate() + 6);

        const effectiveEnd = w === 0 ? today : weekSunday;
        let total = 0, done = 0;

        const cursor = new Date(weekMonday);
        while (cursor <= effectiveEnd) {
            total++;
            const iso = cursor.toISOString().slice(0, 10);
            if (doneSet.has(iso)) done++;
            cursor.setDate(cursor.getDate() + 1);
        }

        result.push({ pct: total > 0 ? done / total : 0, isCurrent: w === 0 });
    }
    return result;
}
```

- [ ] **Step 7.3: Add `renderTrendChart` function**

```javascript
function renderTrendChart(records) {
    const bars = document.getElementById('trendBars');
    const labels = document.getElementById('trendLabels');
    if (!bars || !labels) return;

    const weeks = computeWeeklyTrend(records, 8);
    const maxPct = Math.max(...weeks.map(w => w.pct), 0.01);

    bars.innerHTML = '';
    labels.innerHTML = '';

    weeks.forEach((w, i) => {
        const bar = document.createElement('div');
        bar.className = 'trend-bar' + (w.isCurrent ? ' current' : '');
        bar.style.height = Math.max(w.pct / maxPct * 100, 4) + '%';
        bar.title = Math.round(w.pct * 100) + '%';
        bars.appendChild(bar);

        const lbl = document.createElement('div');
        lbl.className = 'trend-bar-lbl' + (w.isCurrent ? ' current' : '');
        lbl.textContent = w.isCurrent ? 'now' : `W${i + 1}`;
        labels.appendChild(lbl);
    });
}
```

- [ ] **Step 7.4: Add `renderSubGoalsSection` function**

```javascript
function renderSubGoalsSection(habit) {
    const section = document.getElementById('detailSubGoals');
    const list = document.getElementById('sgTodayList');
    const fill = document.getElementById('sgProgressFill');
    if (!section || !list || !fill) return;

    const subGoals = habit.sub_goals || [];
    if (subGoals.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';

    // Find today's record
    const today = new Date().toISOString().slice(0, 10);
    const todayRec = (habit.records || []).find(r => r.day === today);
    const doneSgIds = new Set(todayRec?.sub_goals_done || []);

    list.innerHTML = '';
    subGoals.forEach(sg => {
        const isDone = doneSgIds.has(sg.id);
        const row = document.createElement('div');
        row.className = 'detail-sg-row';

        const check = document.createElement('div');
        check.className = 'detail-sg-check' + (isDone ? ' done' : '');
        check.addEventListener('click', () => onSgCheckClick(habit.id, sg.id, today));

        const name = document.createElement('span');
        name.className = 'detail-sg-name' + (isDone ? ' done' : '');
        name.textContent = sg.name;

        row.appendChild(check);
        row.appendChild(name);
        list.appendChild(row);
    });

    const pct = subGoals.length > 0 ? (doneSgIds.size / subGoals.length * 100) : 0;
    fill.style.width = pct + '%';
}
```

- [ ] **Step 7.5: Add `onSgCheckClick` handler**

```javascript
async function onSgCheckClick(habitId, sgId, dateIso) {
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            date: dateIso,
            date_fmt: '%Y-%m-%d',
            sub_goal_id: sgId,
        });
        // Refresh the habit in local state and re-render sub-goals section
        const habits = await api.get('/api/v1/habits');
        const habit = habits.find(h => h.id === habitId);
        if (habit) {
            renderSubGoalsSection(habit);
            updateCalendarRecord(dateIso, habit.records?.find(r => r.day === dateIso));
        }
    } catch (e) {
        toast('Failed to update sub-goal', 'error');
    }
}
```

- [ ] **Step 7.6: Add `renderRecentNotes` function**

```javascript
async function renderRecentNotes(habitId) {
    const list = document.getElementById('detailNotesList');
    const addBtn = document.getElementById('detailNotesAdd');
    if (!list || !addBtn) return;

    list.innerHTML = '';

    try {
        const notes = await api.get(`/api/v1/notes?habit_id=${habitId}`);
        const recent = notes.slice(0, 2); // already newest-first from API

        if (recent.length === 0) {
            // no notes — just the add button is shown
        } else {
            for (const note of recent) {
                const item = document.createElement('div');
                item.className = 'detail-note-item';
                item.addEventListener('click', () => {
                    location.href = `/notes?id=${note.id}`;
                });

                const date = document.createElement('div');
                date.className = 'detail-note-date';
                date.textContent = new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                const title = document.createElement('div');
                title.className = 'detail-note-title';
                title.textContent = note.title || 'Untitled';

                item.appendChild(date);
                item.appendChild(title);
                list.appendChild(item);
            }
        }
    } catch (e) {
        // silently fail — notes are non-critical
    }

    addBtn.onclick = () => {
        location.href = `/notes?new=1&habit_id=${habitId}`;
    };
}
```

- [ ] **Step 7.7: Wire everything into `showDetail`**

Find the existing `showDetail` function (or equivalent — the function called when a habit row is clicked). It already calls `mountCalendar` and loads stats. Add calls to the three new render functions. The additions go after `mountCalendar(...)`:

```javascript
    // Render right column
    renderTrendChart(h.records || []);
    renderSubGoalsSection(h);
    renderRecentNotes(h.id);
```

Also handle the `/notes?id=` case in the notes page — add to `notes-page.js` init():

In `init()`, after `renderMain()`, add:
```javascript
    const noteId = params.get('id');
    if (noteId) {
        state.selectedId = noteId;
        setView('list', false);
        renderFilters();
        renderMain();
        history.replaceState({}, '', '/notes');
    }
```

- [ ] **Step 7.8: Verify full detail panel in browser**

Start the dev server and open `http://localhost:8080`. Click any habit. Verify:
1. Detail panel shows two columns side by side
2. Left col: 4 stat cards (not 6) + inset calendar (darker background, full width)
3. Right col: weekly trend bars visible, recent notes section visible
4. For habits with sub-goals (e.g. Salah): sub-goals checklist appears at top of right col
5. Clicking a sub-goal checkbox updates it immediately
6. "+ Add note" button navigates to `/notes` with a pre-linked note

On mobile (resize browser to < 768px):
7. Right col stacks below left col
8. Calendar fills full width

- [ ] **Step 7.9: Commit**

```bash
git add beaverhabits/static/js/habits.js beaverhabits/static/js/notes-page.js
git commit -m "feat: detail panel — trend chart, sub-goals, recent notes wired up"
```

---

## Task 8: Final polish + push

- [ ] **Step 8.1: Run full test suite**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
.venv/bin/pytest --tb=short -q
```

Expected: all tests pass

- [ ] **Step 8.2: Verify notes page habit filter chips**

1. Create a note linked to "Exercise"
2. Create another note with no habit
3. Open `/notes` — verify "Exercise" chip appears in filter bar
4. Click the "Exercise" chip — only the linked note shows
5. Click "All" — both notes show

- [ ] **Step 8.3: Verify view toggle persistence**

1. Switch to grid view on `/notes`
2. Navigate to `/` and back to `/notes`
3. Grid view should still be active

- [ ] **Step 8.4: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 8.5: Send ntfy notification**

```bash
curl -s -H 'Title: HabitLab' -d 'ALL DONE: DETAIL PANEL REDESIGN + NOTES APP COMPLETE. TWO-COLUMN LAYOUT, INSET CALENDAR, TREND CHART, SUB-GOALS, NOTES PAGE WITH LIST+GRID TOGGLE.' ntfy.sh/mjlabclaude
```
