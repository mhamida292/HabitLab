# Task Sync & Swipe Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the swipe delete banner z-index bug on the Habits page, and move Today tab task storage from `localStorage` to the server so tasks sync across all devices.

**Architecture:** Tasks are stored as a flat JSON list in the per-user `HabitListModel.data` blob (same pattern as notes). Four new REST endpoints under `/api/v1/tasks` handle CRUD. The frontend uses optimistic updates for instant feel, and re-fetches silently on tab focus for cross-device sync.

**Tech Stack:** Python/FastAPI backend, SQLAlchemy async SQLite, vanilla JS ES modules, no new dependencies.

---

### Task 1: Fix swipe delete banner z-index bug

**Files:**
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 1: Reproduce the bug mentally**

  The `.hrow-swipe-btns` div is `position: absolute; top: 0; bottom: 0` inside `.hrow-wrap`. When the confirmation banner is appended as a child of `.hrow-wrap`, the wrap grows taller and the swipe buttons stretch down behind the banner. The banner has no stacking context so it renders underneath.

- [ ] **Step 2: Apply the fix**

  In `beaverhabits/static/css/styles.css`, find the `.hrow-delete-confirm` rule (around line 1199) and add `position: relative; z-index: 2;`:

  Change from:
  ```css
  .hrow-delete-confirm {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; background: #7f1d1d;
      font-size: 12px; color: #fca5a5;
      border-radius: 0 0 var(--radius, 10px) var(--radius, 10px);
  }
  ```

  Change to:
  ```css
  .hrow-delete-confirm {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 14px; background: #7f1d1d;
      font-size: 12px; color: #fca5a5;
      border-radius: 0 0 var(--radius, 10px) var(--radius, 10px);
      position: relative; z-index: 2;
  }
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add beaverhabits/static/css/styles.css
  git commit -m "fix: swipe delete banner renders above swipe buttons (z-index: 2)

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 2: Add `patch` method to `api.js`

**Files:**
- Modify: `beaverhabits/static/js/api.js`

- [ ] **Step 1: Add `patch` to the exported `api` object**

  In `beaverhabits/static/js/api.js`, find the `export const api` block and add a `patch` entry:

  Change from:
  ```js
  export const api = {
      get: (path) => _fetch('GET', path),
      post: (path, body) => _fetch('POST', path, { body }),
      put: (path, body) => _fetch('PUT', path, { body }),
      delete: (path) => _fetch('DELETE', path),
      upload: (path, formData) => _fetch('POST', path, { body: formData }),
  };
  ```

  Change to:
  ```js
  export const api = {
      get: (path) => _fetch('GET', path),
      post: (path, body) => _fetch('POST', path, { body }),
      put: (path, body) => _fetch('PUT', path, { body }),
      patch: (path, body) => _fetch('PATCH', path, { body }),
      delete: (path) => _fetch('DELETE', path),
      upload: (path, formData) => _fetch('POST', path, { body: formData }),
  };
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add beaverhabits/static/js/api.js
  git commit -m "feat: add patch method to api.js fetch wrapper

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 3: Add task storage methods to `DictHabitList`

**Files:**
- Modify: `beaverhabits/storage/dict.py`
- Test: `tests/test_tasks_api.py` (storage unit tests only in this task)

- [ ] **Step 1: Write failing unit tests for the storage layer**

  Create `tests/test_tasks_api.py`:

  ```python
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
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  uv run pytest tests/test_tasks_api.py -q
  ```

  Expected: multiple failures with `AttributeError: 'DictHabitList' object has no attribute 'get_tasks'`

- [ ] **Step 3: Implement the storage methods**

  In `beaverhabits/storage/dict.py`, after the `delete_note` method (at the very end of the `DictHabitList` class), add:

  ```python
      # ── Tasks ─────────────────────────────────────────────────────────────
      def get_tasks(self, date: str, carry: bool = False) -> list[dict]:
          all_tasks = self.data.setdefault("tasks", [])
          date_tasks = [t for t in all_tasks if t.get("date") == date]

          if not carry:
              return date_tasks

          seen_ids = {t["id"] for t in date_tasks}
          carried = []
          date_obj = datetime.date.fromisoformat(date)
          for i in range(1, 8):
              past = (date_obj - datetime.timedelta(days=i)).isoformat()
              for t in all_tasks:
                  if (
                      t.get("date") == past
                      and not t.get("done", False)
                      and t["id"] not in seen_ids
                  ):
                      carried.append({**t, "carriedFrom": past})
                      seen_ids.add(t["id"])

          return carried + date_tasks

      def add_task(self, date: str, text: str) -> dict:
          task = {
              "id": uuid.uuid4().hex[:8],
              "text": text.strip(),
              "done": False,
              "date": date,
          }
          self.data.setdefault("tasks", []).append(task)
          return task

      def update_task(
          self,
          task_id: str,
          done: bool | None = None,
          text: str | None = None,
      ) -> dict | None:
          tasks = self.data.setdefault("tasks", [])
          task = next((t for t in tasks if t["id"] == task_id), None)
          if task is None:
              return None
          if done is not None:
              task["done"] = done
          if text is not None:
              task["text"] = text.strip()
          return task

      def delete_task(self, task_id: str) -> bool:
          tasks = self.data.setdefault("tasks", [])
          before = len(tasks)
          self.data["tasks"] = [t for t in tasks if t["id"] != task_id]
          return len(self.data["tasks"]) < before
  ```

  Note: `dict.py` already imports `datetime` and `uuid` at the top — no new imports needed.

- [ ] **Step 4: Run tests to confirm they pass**

  ```bash
  uv run pytest tests/test_tasks_api.py -q
  ```

  Expected: `14 passed`

- [ ] **Step 5: Commit**

  ```bash
  git add beaverhabits/storage/dict.py tests/test_tasks_api.py
  git commit -m "feat: add task storage methods to DictHabitList

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 4: Add `/tasks` API endpoints

**Files:**
- Modify: `beaverhabits/routes/api.py`
- Test: `tests/test_tasks_api.py` (add API integration tests)

- [ ] **Step 1: Write failing API integration tests**

  Append to `tests/test_tasks_api.py`:

  ```python
  # ── API integration tests ──────────────────────────────────────────────────

  @pytest.mark.asyncio
  async def test_list_tasks_empty(authed_client):
      resp = await authed_client.get("/api/v1/tasks?date=2026-05-26")
      assert resp.status_code == 200
      assert resp.json() == []


  @pytest.mark.asyncio
  async def test_create_task(authed_client):
      resp = await authed_client.post(
          "/api/v1/tasks",
          json={"text": "Buy groceries", "date": "2026-05-26"},
      )
      assert resp.status_code == 200
      data = resp.json()
      assert data["text"] == "Buy groceries"
      assert data["done"] is False
      assert data["date"] == "2026-05-26"
      assert "id" in data


  @pytest.mark.asyncio
  async def test_list_tasks_filters_by_date(authed_client):
      await authed_client.post("/api/v1/tasks", json={"text": "Today", "date": "2026-05-26"})
      await authed_client.post("/api/v1/tasks", json={"text": "Yesterday", "date": "2026-05-25"})
      resp = await authed_client.get("/api/v1/tasks?date=2026-05-26")
      assert resp.status_code == 200
      tasks = resp.json()
      assert len(tasks) == 1
      assert tasks[0]["text"] == "Today"


  @pytest.mark.asyncio
  async def test_list_tasks_carry_forward(authed_client):
      # Create an undone task for yesterday
      await authed_client.post("/api/v1/tasks", json={"text": "Undone", "date": "2026-05-25"})
      resp = await authed_client.get("/api/v1/tasks?date=2026-05-26&carry=true")
      assert resp.status_code == 200
      tasks = resp.json()
      assert len(tasks) == 1
      assert tasks[0]["carriedFrom"] == "2026-05-25"


  @pytest.mark.asyncio
  async def test_patch_task_done(authed_client):
      create = await authed_client.post(
          "/api/v1/tasks", json={"text": "Do it", "date": "2026-05-26"}
      )
      task_id = create.json()["id"]
      resp = await authed_client.patch(f"/api/v1/tasks/{task_id}", json={"done": True})
      assert resp.status_code == 200
      assert resp.json()["done"] is True


  @pytest.mark.asyncio
  async def test_patch_task_not_found(authed_client):
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
      # Confirm gone
      list_resp = await authed_client.get("/api/v1/tasks?date=2026-05-26")
      assert all(t["id"] != task_id for t in list_resp.json())


  @pytest.mark.asyncio
  async def test_delete_task_not_found(authed_client):
      resp = await authed_client.delete("/api/v1/tasks/nonexistent")
      assert resp.status_code == 404
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  uv run pytest tests/test_tasks_api.py -k "authed_client" -q
  ```

  Expected: failures with `404 Not Found` (routes don't exist yet)

- [ ] **Step 3: Add the task endpoints to `api.py`**

  In `beaverhabits/routes/api.py`, before the `init_api_routes` function at the bottom of the file, add:

  ```python
  # ── Tasks ─────────────────────────────────────────────────────────────────────

  class CreateTask(BaseModel):
      text: str
      date: str  # YYYY-MM-DD


  class UpdateTask(BaseModel):
      done: bool | None = None
      text: str | None = None


  @api_router.get("/tasks", tags=["tasks"])
  async def get_tasks(
      date: str,
      carry: bool = False,
      habit_list: HabitList = Depends(current_habit_list),
  ):
      return habit_list.get_tasks(date, carry=carry)


  @api_router.post("/tasks", tags=["tasks"])
  async def post_task(
      task: CreateTask,
      user: User = Depends(current_active_user),
  ):
      habit_list = await _get_or_create_habit_list(user)
      created = habit_list.add_task(task.date, task.text)
      await _storage.save_user_habit_list(user, habit_list)
      return created


  @api_router.patch("/tasks/{task_id}", tags=["tasks"])
  async def patch_task(
      task_id: str,
      task: UpdateTask,
      user: User = Depends(current_active_user),
  ):
      habit_list = await _get_or_create_habit_list(user)
      updated = habit_list.update_task(task_id, done=task.done, text=task.text)
      if updated is None:
          raise HTTPException(status_code=404, detail="Task not found")
      await _storage.save_user_habit_list(user, habit_list)
      return updated


  @api_router.delete("/tasks/{task_id}", tags=["tasks"])
  async def delete_task_route(
      task_id: str,
      user: User = Depends(current_active_user),
  ):
      habit_list = await _get_or_create_habit_list(user)
      deleted = habit_list.delete_task(task_id)
      if not deleted:
          raise HTTPException(status_code=404, detail="Task not found")
      await _storage.save_user_habit_list(user, habit_list)
      return {"ok": True}
  ```

  Note: `current_habit_list` is the existing `Depends` helper already defined in `api.py` at line 46. The `HabitList` type in the `Depends` annotation is already imported. The `get_tasks`, `add_task`, `update_task`, `delete_task` methods are on `DictHabitList` which is what `current_habit_list` returns — `HabitList` is the abstract base but `habit_list.get_tasks()` will resolve correctly since Python is duck-typed. To be safe, type the parameter as `DictHabitList`:

  Replace:
  ```python
  async def get_tasks(
      date: str,
      carry: bool = False,
      habit_list: HabitList = Depends(current_habit_list),
  ):
  ```

  With:
  ```python
  async def get_tasks(
      date: str,
      carry: bool = False,
      habit_list: DictHabitList = Depends(current_habit_list),
  ):
  ```

- [ ] **Step 4: Run all task tests**

  ```bash
  uv run pytest tests/test_tasks_api.py -q
  ```

  Expected: `22 passed` (14 unit + 8 integration)

- [ ] **Step 5: Run the full test suite to check for regressions**

  ```bash
  uv run pytest -q
  ```

  Expected: all tests pass

- [ ] **Step 6: Commit**

  ```bash
  git add beaverhabits/routes/api.py tests/test_tasks_api.py
  git commit -m "feat: add /api/v1/tasks CRUD endpoints

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 5: Replace `localStorage` task logic in `today.js` with API calls

**Files:**
- Modify: `beaverhabits/static/js/today.js`

This task replaces the `loadTasks` / `saveTasks` / `collectCarriedOver` / `tasksKey` internals with API calls and adds optimistic updates + silent refresh on visibility.

- [ ] **Step 1: Remove the localStorage task helpers and the `tasksKey` constant**

  In `beaverhabits/static/js/today.js`, remove the `tasksKey` constant and replace the entire "Storage keys", "Persistence", and "Carry-forward" sections.

  Remove from:
  ```js
  // ── Storage keys ──────────────────────────────────────────────
  const tasksKey  = iso => `hl-today-tasks-${iso}`;
  const PINNED_KEY = 'hl-today-pinned';

  // ── State ─────────────────────────────────────────────────────
  let allHabits  = [];
  let pinnedIds  = [];
  let viewDay    = TODAY;   // ISO of the day currently being viewed
  let taskItems  = [];      // tasks for viewDay

  // ── Persistence ───────────────────────────────────────────────
  function loadTasks(iso) {
      try { return JSON.parse(localStorage.getItem(tasksKey(iso)) || '[]'); }
      catch { return []; }
  }
  function saveTasks() {
      localStorage.setItem(tasksKey(viewDay), JSON.stringify(taskItems));
  }
  function loadPinned() {
      try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); }
      catch { return []; }
  }
  function savePinned() {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
  }

  // ── Carry-forward (today only) ────────────────────────────────
  function collectCarriedOver() {
      if (viewDay !== TODAY) return;
      const seenIds = new Set(taskItems.map(t => t.id));
      for (let i = 1; i <= 14; i++) {
          const iso = isoAddDays(TODAY, -i);
          try {
              const past = JSON.parse(localStorage.getItem(tasksKey(iso)) || '[]');
              for (const t of past) {
                  if (!t.done && !seenIds.has(t.id)) {
                      taskItems.push({ ...t, carriedFrom: iso });
                      seenIds.add(t.id);
                  }
              }
          } catch {}
      }
  }
  ```

  Replace with:
  ```js
  // ── Storage keys ──────────────────────────────────────────────
  const PINNED_KEY = 'hl-today-pinned';

  // ── State ─────────────────────────────────────────────────────
  let allHabits  = [];
  let pinnedIds  = [];
  let viewDay    = TODAY;   // ISO of the day currently being viewed
  let taskItems  = [];      // tasks for viewDay

  // ── Pinned persistence (stays in localStorage — device UI pref) ──
  function loadPinned() {
      try { return JSON.parse(localStorage.getItem(PINNED_KEY) || '[]'); }
      catch { return []; }
  }
  function savePinned() {
      localStorage.setItem(PINNED_KEY, JSON.stringify(pinnedIds));
  }

  // ── Task API ──────────────────────────────────────────────────
  async function fetchTasks(iso, carry = false) {
      return await api.get(`/api/v1/tasks?date=${iso}${carry ? '&carry=true' : ''}`);
  }
  ```

- [ ] **Step 2: Make `switchDay` async and fetch from server**

  Replace:
  ```js
  // ── Switch viewing day ────────────────────────────────────────
  function switchDay(iso) {
      viewDay   = iso;
      taskItems = loadTasks(iso);
      if (iso === TODAY) collectCarriedOver();
      render();
  }
  ```

  With:
  ```js
  // ── Switch viewing day ────────────────────────────────────────
  async function switchDay(iso) {
      viewDay = iso;
      try {
          taskItems = await fetchTasks(iso, iso === TODAY);
      } catch {
          taskItems = [];
      }
      render();
  }
  ```

- [ ] **Step 3: Make `toggleTask` async with optimistic update**

  Replace:
  ```js
  function toggleTask(id) {
      const t = taskItems.find(x => x.id === id);
      if (t) { t.done = !t.done; saveTasks(); render(); }
  }
  ```

  With:
  ```js
  async function toggleTask(id) {
      const t = taskItems.find(x => x.id === id);
      if (!t) return;
      const prev = t.done;
      t.done = !prev;        // optimistic
      render();
      try {
          const updated = await api.patch(`/api/v1/tasks/${id}`, { done: t.done });
          t.done = updated.done; // confirm server value
          render();
      } catch {
          t.done = prev;     // revert
          render();
          toast('Failed to update task', 'error');
      }
  }
  ```

- [ ] **Step 4: Make `deleteTask` async with optimistic update**

  Replace:
  ```js
  function deleteTask(id, wrapEl) {
      taskItems = taskItems.filter(t => t.id !== id);
      saveTasks();
      // Animate out before full re-render
      wrapEl.style.transition = 'opacity .18s';
      wrapEl.style.opacity = '0';
      setTimeout(render, 200);
  }
  ```

  With:
  ```js
  async function deleteTask(id, wrapEl) {
      const prev = [...taskItems];
      taskItems = taskItems.filter(t => t.id !== id); // optimistic
      wrapEl.style.transition = 'opacity .18s';
      wrapEl.style.opacity = '0';
      setTimeout(render, 200);
      try {
          await api.delete(`/api/v1/tasks/${id}`);
      } catch {
          taskItems = prev;  // revert
          render();
          toast('Failed to delete task', 'error');
      }
  }
  ```

- [ ] **Step 5: Make the add-task input async with optimistic update**

  In the `makeAddRow` function, replace the `keydown` listener body:

  Replace:
  ```js
      inp.addEventListener('keydown', e => {
          if (e.key === 'Enter' && inp.value.trim()) {
              taskItems.push({ id: crypto.randomUUID(), text: inp.value.trim(), done: false });
              saveTasks();
              inp.value = '';
              render();
              setTimeout(() => document.querySelector('.today-add-input')?.focus(), 0);
          }
          if (e.key === 'Escape') inp.blur();
      });
  ```

  With:
  ```js
      inp.addEventListener('keydown', async e => {
          if (e.key === 'Enter' && inp.value.trim()) {
              const text = inp.value.trim();
              inp.value = '';
              // Optimistic: push a temp task immediately
              const tempId = crypto.randomUUID();
              taskItems.push({ id: tempId, text, done: false });
              render();
              setTimeout(() => document.querySelector('.today-add-input')?.focus(), 0);
              try {
                  const created = await api.post('/api/v1/tasks', { text, date: viewDay });
                  // Replace temp with server-assigned task (real id)
                  const idx = taskItems.findIndex(t => t.id === tempId);
                  if (idx !== -1) taskItems[idx] = created;
                  render();
              } catch {
                  taskItems = taskItems.filter(t => t.id !== tempId);
                  render();
                  toast('Failed to add task', 'error');
              }
          }
          if (e.key === 'Escape') inp.blur();
      });
  ```

- [ ] **Step 6: Add `silentRefresh` for cross-device sync**

  In `today.js`, after the `attachSwipe` function and before `initSortable`, add:

  ```js
  // ── Silent refresh (cross-device sync) ───────────────────────
  let _lastRefresh = 0;
  function silentRefresh() {
      const now = Date.now();
      if (now - _lastRefresh < 3000) return; // at most once per 3s
      _lastRefresh = now;
      (async () => {
          try {
              const fresh = await fetchTasks(viewDay, viewDay === TODAY);
              // Only re-render if something actually changed
              if (JSON.stringify(fresh) !== JSON.stringify(taskItems)) {
                  taskItems = fresh;
                  render();
              }
          } catch { /* silently ignore — stale data is fine */ }
      })();
  }
  ```

- [ ] **Step 7: Update the `DOMContentLoaded` init block**

  Replace:
  ```js
  document.addEventListener('DOMContentLoaded', async () => {
      pinnedIds = loadPinned();
      taskItems = loadTasks(TODAY);
      collectCarriedOver();
      saveTasks();

      try {
          allHabits = await api.get('/api/v1/habits');
          if (pinnedIds.length === 0 && allHabits.length > 0) {
              pinnedIds = allHabits.map(h => h.id);
              savePinned();
          }
      } catch { allHabits = []; }

      // Nav arrows
      document.getElementById('todayPrevBtn').addEventListener('click', () => {
          switchDay(isoAddDays(viewDay, -1));
      });
      document.getElementById('todayNextBtn').addEventListener('click', () => {
          if (viewDay < TODAY) switchDay(isoAddDays(viewDay, 1));
      });

      render();
      initSortable();
  });
  ```

  With:
  ```js
  document.addEventListener('DOMContentLoaded', async () => {
      pinnedIds = loadPinned();

      // Fetch tasks and habits in parallel
      const [tasksResult, habitsResult] = await Promise.allSettled([
          fetchTasks(TODAY, true),
          api.get('/api/v1/habits'),
      ]);
      taskItems = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
      allHabits = habitsResult.status === 'fulfilled' ? habitsResult.value : [];

      if (pinnedIds.length === 0 && allHabits.length > 0) {
          pinnedIds = allHabits.map(h => h.id);
          savePinned();
      }

      // Nav arrows
      document.getElementById('todayPrevBtn').addEventListener('click', () => {
          switchDay(isoAddDays(viewDay, -1));
      });
      document.getElementById('todayNextBtn').addEventListener('click', () => {
          if (viewDay < TODAY) switchDay(isoAddDays(viewDay, 1));
      });

      // Cross-device sync: re-fetch tasks whenever tab/window regains focus
      document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') silentRefresh();
      });
      window.addEventListener('focus', silentRefresh);

      render();
      initSortable();
  });
  ```

- [ ] **Step 8: Run the full test suite**

  ```bash
  uv run pytest -q
  ```

  Expected: all tests pass (JS changes have no server-side tests — verified manually in the next step)

- [ ] **Step 9: Commit**

  ```bash
  git add beaverhabits/static/js/today.js
  git commit -m "feat: sync Today tab tasks server-side with optimistic updates + silent refresh

  - Replace localStorage task storage with /api/v1/tasks API calls
  - Optimistic updates for add/toggle/delete (instant UI, revert on error)
  - Tasks + habits fetched in parallel on init
  - silentRefresh() re-fetches on visibilitychange/focus, rate-limited to 3s
  - pinnedIds stays in localStorage (device-local UI preference)
  - Carry-forward now handled server-side via ?carry=true

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  ```

---

### Task 6: Manual smoke test

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server**

  ```bash
  uv run uvicorn beaverhabits.main:app --reload --port 8765
  ```

- [ ] **Step 2: Test task sync**

  1. Open `http://localhost:8765/today` in two browser tabs (simulating desktop + phone)
  2. Add a task in Tab 1 — it should appear immediately
  3. Switch to Tab 2 and click back into it — it should show the same task within 3 seconds (visibility refresh)
  4. Toggle a task done in Tab 1, switch back to Tab 2 — task should show as done
  5. Delete a task in Tab 1, switch to Tab 2 — task should be gone

- [ ] **Step 3: Test swipe delete banner (mobile)**

  On a mobile device or browser DevTools mobile emulation:
  1. Open `http://localhost:8765` (Habits page)
  2. Swipe left on a habit row
  3. Tap the red delete button
  4. The confirmation banner should appear cleanly with no amber/red swipe buttons showing through

- [ ] **Step 4: Test error revert**

  In browser DevTools → Network → set offline mode:
  1. Try adding a task — it should appear briefly then disappear with an error toast
  2. Try toggling a task done — it should toggle then revert with an error toast
