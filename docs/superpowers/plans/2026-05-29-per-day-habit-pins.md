# Per-Day Habit Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single global habit-pin list into daily **defaults** (shown every day) and per-day **ad-hoc** pins (attached to one date), so habits like Journal can be pinned to specific days without bleeding onto every day.

**Architecture:** Storage gains `default_pins` (renamed/migrated from `today_pinned`) and `day_pins` (a date→ids map). The `/habits/meta` API exposes defaults always and the viewed day's extras via `?day=`. The Today tab renders the effective set (defaults first, then that day's extras, deduped) and the pin control grows a ★ star (default) + checkbox (this day) per row.

**Tech Stack:** FastAPI + Starlette, SQLAlchemy async (SQLite), pytest / pytest-asyncio, vanilla-JS ES modules.

Design spec: `docs/superpowers/specs/2026-05-29-per-day-habit-pins-design.md`

---

### Task 1: Storage — `default_pins` (rename + migrate from `today_pinned`)

**Files:**
- Modify: `habitlab/storage/storage.py:236-239` (abstract `HabitList`)
- Modify: `habitlab/storage/dict.py:434-442` (`DictHabitList`)
- Test: `tests/test_today_storage.py:11-22`

- [ ] **Step 1: Update the failing tests (rename + add migration)**

In `tests/test_today_storage.py`, replace the three `today_pinned` tests (lines 11-22) with:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_today_storage.py -k default_pins -v`
Expected: FAIL — `AttributeError: 'DictHabitList' object has no attribute 'default_pins'`

- [ ] **Step 3: Update the abstract interface**

In `habitlab/storage/storage.py`, replace the `today_pinned` property block (lines 236-239):

```python
    @property
    def today_pinned(self) -> list[str]: ...

    @today_pinned.setter
    def today_pinned(self, value: list[str]) -> None: ...
```

with:

```python
    @property
    def default_pins(self) -> list[str]: ...

    @default_pins.setter
    def default_pins(self, value: list[str]) -> None: ...
```

- [ ] **Step 4: Implement in `DictHabitList`**

In `habitlab/storage/dict.py`, replace the "Today pinned" block (lines 434-442):

```python
    # ── Today pinned ───────────────────────────────────────────────────────────

    @property
    def today_pinned(self) -> list[str]:
        return list(self.data.setdefault("today_pinned", []))

    @today_pinned.setter
    def today_pinned(self, value: list[str]) -> None:
        self.data["today_pinned"] = list(value)
```

with:

```python
    # ── Pins: daily defaults ─────────────────────────────────────────────────────

    @property
    def default_pins(self) -> list[str]:
        # Migrate legacy global pins (today_pinned) into defaults on first read.
        if "default_pins" not in self.data and "today_pinned" in self.data:
            self.data["default_pins"] = list(self.data["today_pinned"])
        return list(self.data.setdefault("default_pins", []))

    @default_pins.setter
    def default_pins(self, value: list[str]) -> None:
        self.data["default_pins"] = list(value)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_today_storage.py -k default_pins -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add habitlab/storage/storage.py habitlab/storage/dict.py tests/test_today_storage.py
git commit -m "feat: rename today_pinned to default_pins with legacy migration"
```

---

### Task 2: Storage — `day_pins` (per-date ad-hoc pins)

**Files:**
- Modify: `habitlab/storage/storage.py` (abstract `HabitList`, just after `default_pins`)
- Modify: `habitlab/storage/dict.py` (just after `default_pins`)
- Test: `tests/test_today_storage.py`

- [ ] **Step 1: Write the failing tests**

Append to `tests/test_today_storage.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_today_storage.py -k day_pins -v`
Expected: FAIL — `AttributeError: 'DictHabitList' object has no attribute 'get_day_pins'`

- [ ] **Step 3: Add to the abstract interface**

In `habitlab/storage/storage.py`, immediately after the `default_pins` property/setter you added in Task 1, add:

```python
    def get_day_pins(self, day: str) -> list[str]: ...

    def set_day_pins(self, day: str, ids: list[str]) -> None: ...
```

- [ ] **Step 4: Implement in `DictHabitList`**

In `habitlab/storage/dict.py`, immediately after the `default_pins` property/setter you added in Task 1, add:

```python
    # ── Pins: per-day ad-hoc ─────────────────────────────────────────────────────

    @property
    def day_pins(self) -> dict:
        return self.data.setdefault("day_pins", {})

    def get_day_pins(self, day: str) -> list[str]:
        return list(self.day_pins.get(day, []))

    def set_day_pins(self, day: str, ids: list[str]) -> None:
        if ids:
            self.day_pins[day] = list(ids)
        else:
            self.day_pins.pop(day, None)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `uv run pytest tests/test_today_storage.py -k day_pins -v`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add habitlab/storage/storage.py habitlab/storage/dict.py tests/test_today_storage.py
git commit -m "feat: add per-day ad-hoc habit pins (day_pins) to storage"
```

---

### Task 3: API — `/habits/meta` defaults + day pins

**Files:**
- Modify: `habitlab/routes/api.py:57-86`
- Test: `tests/test_today_api.py:129-175`

- [ ] **Step 1: Update existing tests + add new ones**

In `tests/test_today_api.py`, replace the four meta tests (lines 129-175, from `test_get_habits_meta_includes_pinned_today_ids` through `test_put_habits_meta_can_clear_pinned`) with:

```python
@pytest.mark.asyncio
async def test_get_habits_meta_includes_default_pins(authed_client):
    resp = await authed_client.get("/api/v1/habits/meta")
    assert resp.status_code == 200
    data = resp.json()
    assert "default_pins" in data
    assert data["default_pins"] == []


@pytest.mark.asyncio
async def test_put_habits_meta_sets_default_pins(authed_client, habit):
    resp = await authed_client.put(
        "/api/v1/habits/meta", json={"default_pins": [habit["id"]]}
    )
    assert resp.status_code == 200

    get = await authed_client.get("/api/v1/habits/meta")
    assert habit["id"] in get.json()["default_pins"]


@pytest.mark.asyncio
async def test_put_habits_meta_order_unaffected_by_pins_update(authed_client, habit):
    await authed_client.put("/api/v1/habits/meta", json={"order": [habit["id"]]})
    await authed_client.put(
        "/api/v1/habits/meta", json={"default_pins": [habit["id"]]}
    )
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["order"] == [habit["id"]]
    assert get.json()["default_pins"] == [habit["id"]]


@pytest.mark.asyncio
async def test_put_habits_meta_can_clear_default_pins(authed_client, habit):
    await authed_client.put(
        "/api/v1/habits/meta", json={"default_pins": [habit["id"]]}
    )
    await authed_client.put("/api/v1/habits/meta", json={"default_pins": []})
    get = await authed_client.get("/api/v1/habits/meta")
    assert get.json()["default_pins"] == []


@pytest.mark.asyncio
async def test_get_habits_meta_day_param_returns_day_pins(authed_client, habit):
    await authed_client.put(
        "/api/v1/habits/meta",
        json={"day_pins_date": "2026-06-03", "day_pins_ids": [habit["id"]]},
    )
    resp = await authed_client.get("/api/v1/habits/meta?day=2026-06-03")
    assert resp.json()["day_pins_ids"] == [habit["id"]]


@pytest.mark.asyncio
async def test_day_pins_isolated_per_date_via_api(authed_client, habit):
    await authed_client.put(
        "/api/v1/habits/meta",
        json={"day_pins_date": "2026-06-03", "day_pins_ids": [habit["id"]]},
    )
    resp = await authed_client.get("/api/v1/habits/meta?day=2026-06-04")
    assert resp.json()["day_pins_ids"] == []


@pytest.mark.asyncio
async def test_get_habits_meta_no_day_param_omits_day_pins(authed_client):
    resp = await authed_client.get("/api/v1/habits/meta")
    assert resp.json()["day_pins_ids"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_today_api.py -k "meta or day_pins" -v`
Expected: FAIL — responses still contain `pinned_today_ids`, not `default_pins`; `KeyError`/assert failures.

- [ ] **Step 3: Update the `HabitListMeta` model**

In `habitlab/routes/api.py`, replace the model (lines 57-59):

```python
class HabitListMeta(BaseModel):
    order: list[str] | None = None
    pinned_today_ids: list[str] | None = None
```

with:

```python
class HabitListMeta(BaseModel):
    order: list[str] | None = None
    default_pins: list[str] | None = None
    day_pins_date: str | None = None
    day_pins_ids: list[str] | None = None
```

- [ ] **Step 4: Update the GET endpoint**

In `habitlab/routes/api.py`, replace `get_habits_meta` (lines 62-69):

```python
@api_router.get("/habits/meta", tags=["habits"])
async def get_habits_meta(
    habit_list: HabitList = Depends(current_habit_list),
):
    return HabitListMeta(
        order=habit_list.order,
        pinned_today_ids=habit_list.today_pinned,
    )
```

with:

```python
@api_router.get("/habits/meta", tags=["habits"])
async def get_habits_meta(
    day: str | None = None,
    habit_list: HabitList = Depends(current_habit_list),
):
    return HabitListMeta(
        order=habit_list.order,
        default_pins=habit_list.default_pins,
        day_pins_date=day,
        day_pins_ids=habit_list.get_day_pins(day) if day else None,
    )
```

- [ ] **Step 5: Update the PUT endpoint**

In `habitlab/routes/api.py`, replace `put_habits_meta` (lines 72-86):

```python
@api_router.put("/habits/meta", tags=["habits"])
async def put_habits_meta(
    meta: HabitListMeta,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    if meta.order is not None:
        habit_list.order = meta.order
    if meta.pinned_today_ids is not None:
        habit_list.today_pinned = meta.pinned_today_ids
    await _storage.save_user_habit_list(user, habit_list)
    return {
        "order": habit_list.order,
        "pinned_today_ids": habit_list.today_pinned,
    }
```

with:

```python
@api_router.put("/habits/meta", tags=["habits"])
async def put_habits_meta(
    meta: HabitListMeta,
    user: User = Depends(current_active_user),
):
    habit_list = await _get_or_create_habit_list(user)
    if meta.order is not None:
        habit_list.order = meta.order
    if meta.default_pins is not None:
        habit_list.default_pins = meta.default_pins
    if meta.day_pins_date is not None and meta.day_pins_ids is not None:
        habit_list.set_day_pins(meta.day_pins_date, meta.day_pins_ids)
    await _storage.save_user_habit_list(user, habit_list)
    return {
        "order": habit_list.order,
        "default_pins": habit_list.default_pins,
        "day_pins_date": meta.day_pins_date,
        "day_pins_ids": (
            habit_list.get_day_pins(meta.day_pins_date)
            if meta.day_pins_date is not None
            else None
        ),
    }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `uv run pytest tests/test_today_api.py -k "meta or day_pins" -v`
Expected: PASS (7 tests)

- [ ] **Step 7: Run the full backend suite (catch stray `today_pinned`/`pinned_today_ids` references)**

Run: `uv run pytest -q`
Expected: PASS, no failures. If anything references the old names, fix it.

- [ ] **Step 8: Commit**

```bash
git add habitlab/routes/api.py tests/test_today_api.py
git commit -m "feat: expose default_pins and per-day day_pins via /habits/meta"
```

---

### Task 4: Frontend — state, loading, and effective-pins helper

**Files:**
- Modify: `habitlab/static/js/today.js:48-90` (state + `loadAll` + `computeStats`)
- Modify: `habitlab/static/js/today.js:206-208` (`renderHabitPins` pinned list)

No JS unit-test harness exists in this repo; verification for Tasks 4-6 is manual in the browser (Task 7 covers the end-to-end recipe). Each task still commits independently.

- [ ] **Step 1: Replace the `pinnedIds` state declaration**

In `habitlab/static/js/today.js`, replace line 51:

```js
let pinnedIds = [];   // order matters — used for display order
```

with:

```js
let defaultPins = [];  // ★ habits — shown every day. order matters.
let dayPins = [];      // ad-hoc pins for viewDay only. order matters.
```

- [ ] **Step 2: Update `loadAll` to fetch defaults + the viewed day's pins**

In `habitlab/static/js/today.js`, in `loadAll` (lines 60-76), replace the meta fetch and assignment. Change the `api.get('/api/v1/habits/meta')` line and the `pinnedIds = meta.pinned_today_ids || [];` line so the block reads:

```js
        const [tasks, habits, meta] = await Promise.all([
            api.get(`/api/v1/tasks?date=${viewDay}&carry=${carry}`),
            api.get('/api/v1/habits'),
            api.get(`/api/v1/habits/meta?day=${viewDay}`),
        ]);
        taskItems = tasks;
        allHabits = habits;
        defaultPins = meta.default_pins || [];
        dayPins = meta.day_pins_ids || [];
```

- [ ] **Step 3: Add the `effectivePins` helpers and update `computeStats`**

In `habitlab/static/js/today.js`, replace `computeStats` (lines 78-90) with:

```js
// ── Shared stats helper ────────────────────────────────────────────────────────
// Effective pinned set for the viewed day: defaults first (saved order),
// then that day's extras (add order), with extras that are also defaults dropped.
function effectivePinIds() {
    const extras = dayPins.filter(id => !defaultPins.includes(id));
    return [...defaultPins, ...extras];
}

function effectivePins() {
    return effectivePinIds()
        .map(id => allHabits.find(h => h.id === id))
        .filter(Boolean);
}

function computeStats(day) {
    const pinned = effectivePins();
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === day);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    return { pinned, done, total };
}
```

- [ ] **Step 4: Update `renderHabitPins` to use `effectivePins`**

In `habitlab/static/js/today.js`, in `renderHabitPins`, replace lines 206-208:

```js
    // Use pinnedIds order — drag-reorder updates this array
    const pinned = pinnedIds.map(id => allHabits.find(h => h.id === id)).filter(Boolean);
    if (pinned.length === 0) return;
```

with:

```js
    // Effective set for the viewed day — defaults + this day's extras
    const pinned = effectivePins();
    if (pinned.length === 0) return;
```

- [ ] **Step 5: Verify no stale `pinnedIds` references remain in render/stats paths**

Run: `grep -n "pinnedIds" habitlab/static/js/today.js`
Expected: only matches inside `renderPinControl`, `togglePin`, and the Sortable `onEnd` handler — all replaced in Tasks 5 and 6. Note them; do not edit yet.

- [ ] **Step 6: Smoke-check the app still loads**

Run: `uv run uvicorn habitlab.main:app --port 8765` (Ctrl-C after), open `http://localhost:8765/today`, confirm the page renders and pinned habits still appear (defaults migrated from old pins). The pin control checkboxes will look unchanged until Task 5.

- [ ] **Step 7: Commit**

```bash
git add habitlab/static/js/today.js
git commit -m "feat: today.js loads default + per-day pins via effectivePins"
```

---

### Task 5: Frontend — pin control (★ star + per-day checkbox) and toggles

**Files:**
- Modify: `habitlab/static/js/today.js:346-379` (`renderPinControl`)
- Modify: `habitlab/static/js/today.js:658-670` (`togglePin` → two toggles)
- Modify: `habitlab/static/css/styles.css:1418-1429` (pin row styles)

- [ ] **Step 1: Rewrite `renderPinControl`**

In `habitlab/static/js/today.js`, replace `renderPinControl` (lines 346-379) with:

```js
// ── Pin control ─────────────────────────────────────────────────────────────────
function renderPinControl() {
    const el = document.getElementById('todayPinControl');
    if (!el) return;
    el.innerHTML = '';
    if (allHabits.length === 0) return;

    const readOnly = viewDay < TODAY; // past days are read-only (matches add-task)

    el.appendChild(Object.assign(document.createElement('div'), { className: 'tl-divider' }));

    const label = document.createElement('div');
    label.className = 'tl-pin-label';
    label.textContent = 'Pin habits';
    el.appendChild(label);

    allHabits.forEach(h => {
        const isDefault = defaultPins.includes(h.id);

        const row = document.createElement('div');
        row.className = 'tl-pin-row';

        // ★ default toggle — shows the habit every day
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'tl-pin-star' + (isDefault ? ' on' : '');
        star.textContent = isDefault ? '★' : '☆';
        star.title = isDefault ? 'Shown every day — click to remove' : 'Show every day';
        star.disabled = readOnly;
        star.addEventListener('click', e => {
            e.preventDefault();
            if (!readOnly) toggleDefault(h.id);
        });

        // per-day cell: checkbox, or "—" when the habit is a default
        const dayCell = document.createElement('span');
        dayCell.className = 'tl-pin-daycell';
        if (isDefault) {
            const dash = document.createElement('span');
            dash.className = 'tl-pin-dash';
            dash.textContent = '—';
            dash.title = 'Already shown every day';
            dayCell.appendChild(dash);
        } else {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = dayPins.includes(h.id);
            cb.disabled = readOnly;
            cb.addEventListener('change', () => toggleDayPin(h.id));
            dayCell.appendChild(cb);
        }

        const iconWrap = document.createElement('span');
        iconWrap.appendChild(buildIconEl(h.icon || '📌', 13));

        const name = document.createElement('span');
        name.textContent = h.name;

        row.append(star, dayCell, iconWrap, name);
        el.appendChild(row);
    });
    applyIcons();
}
```

- [ ] **Step 2: Replace `togglePin` with `toggleDefault` and `toggleDayPin`**

In `habitlab/static/js/today.js`, replace `togglePin` (lines 658-670) with:

```js
async function toggleDefault(habitId) {
    if (defaultPins.includes(habitId)) {
        defaultPins = defaultPins.filter(id => id !== habitId);
    } else {
        defaultPins = [...defaultPins, habitId];
    }
    render();
    try {
        await api.put('/api/v1/habits/meta', { default_pins: defaultPins });
    } catch (err) {
        toast('Failed to save pin — reload to resync', 'error');
    }
}

async function toggleDayPin(habitId) {
    if (dayPins.includes(habitId)) {
        dayPins = dayPins.filter(id => id !== habitId);
    } else {
        dayPins = [...dayPins, habitId];
    }
    render();
    try {
        await api.put('/api/v1/habits/meta', { day_pins_date: viewDay, day_pins_ids: dayPins });
    } catch (err) {
        toast('Failed to save pin — reload to resync', 'error');
    }
}
```

- [ ] **Step 3: Add the star + day-cell CSS**

In `habitlab/static/css/styles.css`, after the `.tl-pin-row input[type="checkbox"]` rule (line 1429), add:

```css
.tl-pin-star {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-size: 0.95rem;
    line-height: 1;
    color: var(--border);
    transition: color 0.12s;
}
.tl-pin-star.on { color: var(--accent); }
.tl-pin-star:disabled { cursor: default; opacity: 0.5; }
.tl-pin-daycell {
    width: 18px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
}
.tl-pin-dash { color: var(--text-muted); }
```

- [ ] **Step 4: Manual verification**

Run: `uv run uvicorn habitlab.main:app --port 8765`, open `http://localhost:8765/today`. Confirm:
- Each pin row shows a ★ star, then a checkbox (or "—" for starred habits), then icon + name.
- Migrated defaults render with a filled green ★ and a "—" in the day cell.
- Toggling a star moves the habit in/out of every day; toggling a checkbox pins it to the viewed day only.
- Reload — choices persist.

- [ ] **Step 5: Commit**

```bash
git add habitlab/static/js/today.js habitlab/static/css/styles.css
git commit -m "feat: star=default + checkbox=this-day pin control on Today tab"
```

---

### Task 6: Frontend — drag-reorder persists defaults and per-day order separately

**Files:**
- Modify: `habitlab/static/js/today.js:118-125` (Sortable `onEnd` handler)

- [ ] **Step 1: Update the Sortable `onEnd` handler**

In `habitlab/static/js/today.js`, in `initSortables`, replace the `onEnd` body (lines 118-125):

```js
            onEnd(evt) {
                if (evt.oldIndex === evt.newIndex) return;
                // Read new order from DOM, update state, persist
                pinnedIds = [...pinsEl.querySelectorAll('.tl-habit-group[data-habit-id]')]
                    .map(el => el.dataset.habitId);
                api.put('/api/v1/habits/meta', { pinned_today_ids: pinnedIds })
                    .catch(() => toast('Failed to save habit order', 'error'));
            },
```

with:

```js
            onEnd(evt) {
                if (evt.oldIndex === evt.newIndex) return;
                // Read new visible order, split into defaults vs this-day extras,
                // and persist each in its new relative order.
                const ids = [...pinsEl.querySelectorAll('.tl-habit-group[data-habit-id]')]
                    .map(el => el.dataset.habitId);
                defaultPins = ids.filter(id => defaultPins.includes(id));
                dayPins = ids.filter(id => dayPins.includes(id) && !defaultPins.includes(id));
                Promise.all([
                    api.put('/api/v1/habits/meta', { default_pins: defaultPins }),
                    api.put('/api/v1/habits/meta', { day_pins_date: viewDay, day_pins_ids: dayPins }),
                ]).catch(() => toast('Failed to save habit order', 'error'));
            },
```

- [ ] **Step 2: Manual verification**

Run: `uv run uvicorn habitlab.main:app --port 8765`, open `http://localhost:8765/today`. With at least one default and one day-pin visible:
- Drag to reorder within the defaults — reload, order persists.
- Drag a day-pin extra — reload; defaults still render first, extra order persists among extras.

- [ ] **Step 3: Commit**

```bash
git add habitlab/static/js/today.js
git commit -m "feat: persist default and per-day pin order on drag-reorder"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend suite**

Run: `uv run pytest -q`
Expected: PASS, no failures.

- [ ] **Step 2: Confirm no legacy field names remain in shipped code**

Run: `grep -rn "today_pinned\|pinned_today_ids" habitlab/`
Expected: no matches (the `default_pins` migration getter in `dict.py` references the string `"today_pinned"` as a dict key only — that single occurrence is expected and correct).

- [ ] **Step 3: End-to-end scenario (the Journal case)**

Run: `uv run uvicorn habitlab.main:app --port 8765`, open `http://localhost:8765/today`. Then:
1. In "Pin habits", leave a non-daily habit (e.g. Journal) **unstarred**; on today, tick its checkbox → it appears in the day's list.
2. Navigate to **tomorrow** (→) → Journal is **absent**; tick its checkbox there → appears tomorrow only.
3. Navigate **back to today** → Journal still pinned today; its tomorrow state is independent.
4. Star a daily habit → it appears on today, tomorrow, and a **past** day (← navigation), and its checkbox shows "—".
5. On a **past** day, confirm star and checkbox controls are disabled (read-only).
6. Hard-refresh (Ctrl+Shift+R) → all pin states persist.

- [ ] **Step 4: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "chore: verification fixes for per-day habit pins"
```
