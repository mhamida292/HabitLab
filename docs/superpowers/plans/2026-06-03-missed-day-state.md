# Missed-Day State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit "missed" day state (red ✕) settable from the monthly detail calendar and the Today tab, stats-equivalent to a blank day.

**Architecture:** A single `missed` boolean is stored per day record. `tick()` enforces the invariant that any done/non-zero day clears `missed`. A shared `daymenu.js` module renders one identical Completed/Not-completed/Clear context menu, triggered by right-click (desktop) and long-press (touch) from both `monthly.js` calendar cells and `today.js` habit rows. Stats are untouched — a missed day has `count: 0`.

**Tech Stack:** FastAPI + SQLAlchemy/aiosqlite (backend), Pydantic models, vanilla-JS ES modules (frontend), pytest + pytest-asyncio (tests).

**Reference spec:** `docs/superpowers/specs/2026-06-03-missed-day-state-design.md`

---

### Task 1: Storage — `missed` field on `DictRecord`

**Files:**
- Modify: `habitlab/storage/dict.py` (`DictRecord`, around lines 76-81)
- Test: `tests/test_storage.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_storage.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_storage.py::test_missed_property_defaults_false tests/test_storage.py::test_missed_setter_persists -v`
Expected: FAIL with `AttributeError: 'DictRecord' object has no attribute 'missed'`

- [ ] **Step 3: Add the `missed` property to `DictRecord`**

In `habitlab/storage/dict.py`, after the `sub_goals_done` property/setter (around line 81), add:

```python
    @property
    def missed(self) -> bool:
        return bool(self.data.get("missed", False))

    @missed.setter
    def missed(self, value: bool) -> None:
        self.data["missed"] = bool(value)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run pytest tests/test_storage.py::test_missed_property_defaults_false tests/test_storage.py::test_missed_setter_persists -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add habitlab/storage/dict.py tests/test_storage.py
git commit -m "feat: add missed property to DictRecord"
```

---

### Task 2: Storage — `tick()` accepts `missed` with the clear-on-done invariant

**Files:**
- Modify: `habitlab/storage/dict.py` (`DictHabit.tick`, lines 257-299)
- Test: `tests/test_storage.py`

- [ ] **Step 1: Write the failing tests**

Add to `tests/test_storage.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `uv run pytest tests/test_storage.py -k "tick_marks_missed or tick_done_clears_missed or tick_clear_resets or tick_positive_count_clears" -v`
Expected: FAIL with `TypeError: tick() got an unexpected keyword argument 'missed'`

- [ ] **Step 3: Update `tick()` to handle `missed`**

In `habitlab/storage/dict.py`, change the `tick` signature (line 257-263) to add the param:

```python
    async def tick(
        self,
        day: datetime.date,
        done: bool | None = None,
        text: str | None = None,
        count: int | None = None,
        missed: bool | None = None,
    ) -> CheckedRecord:
```

Then, after `new_count` is resolved and before `if "records" not in self.data:` (currently line 278), compute the missed value:

```python
        # Resolve missed flag. Existing value is the fallback when `missed` is omitted.
        record = self.ticked_data.get(day)
        if missed is not None:
            new_missed = bool(missed)
        else:
            new_missed = record.missed if record is not None else False
        # Invariant: a done / non-zero day can never be "missed".
        new_done = new_count >= target
        if new_done or new_count > 0:
            new_missed = False
```

Note: `record` is already fetched earlier in the function (line 268: `record = self.ticked_data.get(day)`). Reuse that existing variable — do not re-fetch; the block above assumes `record` and `new_count` are in scope, so place it after line 277.

Then write `missed` into both branches. Replace the update-in-place branch (lines 282-287) and new-record branch (lines 288-296) so each sets `missed`:

```python
        if record is not None:
            record.data["count"] = new_count
            record.data["done"] = new_count >= target
            record.data["missed"] = new_missed
            if text is not None:
                record.data["text"] = text
        else:
            data = {
                "day": day.strftime(DAY_MASK),
                "count": new_count,
                "done": new_count >= target,
                "missed": new_missed,
            }
            if text is not None:
                data["text"] = text
            self.data["records"].append(data)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `uv run pytest tests/test_storage.py -k "tick_marks_missed or tick_done_clears_missed or tick_clear_resets or tick_positive_count_clears" -v`
Expected: PASS

- [ ] **Step 5: Run the full storage suite for regressions**

Run: `uv run pytest tests/test_storage.py -v`
Expected: PASS (all existing tests still green)

- [ ] **Step 6: Commit**

```bash
git add habitlab/storage/dict.py tests/test_storage.py
git commit -m "feat: tick() accepts missed flag with clear-on-done invariant"
```

---

### Task 3: API — `Tick.missed`, pass-through, and serialization

**Files:**
- Modify: `habitlab/routes/api.py` (`Tick` model line 345-351; completions handler line 406; `_record_to_dict` line 638-644; inline records serializer line 143-149)
- Test: `tests/test_apis.py`

- [ ] **Step 1: Write the failing test**

Add to `tests/test_apis.py` (uses the existing `authed_client` and `habit` fixtures — see `test_tick_sub_goal_id_toggles_sub_goals_done` for the pattern):

```python
@pytest.mark.asyncio
async def test_completion_missed_roundtrip(authed_client, habit):
    # Mark a day missed
    resp = await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"missed": True, "date": "2026-06-04", "date_fmt": "%Y-%m-%d"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["done"] is False
    assert body["count"] == 0

    # GET /habits should report missed: true for that day
    habits = (await authed_client.get("/api/v1/habits")).json()
    target = next(h for h in habits if h["id"] == habit["id"])
    rec = next(r for r in target["records"] if r["day"] == "2026-06-04")
    assert rec["missed"] is True

    # Completing the day clears missed
    await authed_client.post(
        f"/api/v1/habits/{habit['id']}/completions",
        json={"done": True, "date": "2026-06-04", "date_fmt": "%Y-%m-%d"},
    )
    habits2 = (await authed_client.get("/api/v1/habits")).json()
    target2 = next(h for h in habits2 if h["id"] == habit["id"])
    rec2 = next(r for r in target2["records"] if r["day"] == "2026-06-04")
    assert rec2["missed"] is False
    assert rec2["done"] is True
```

(If the `habit` fixture's habit `id`/records shape differs, confirm via the existing `test_tick_sub_goal_id_toggles_sub_goals_done` test and the GET `/api/v1/habits` response — keep the assertions on `missed`/`done` regardless.)

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run pytest tests/test_apis.py::test_completion_missed_roundtrip -v`
Expected: FAIL — `missed` not accepted / not present in records (KeyError or `missed` absent).

- [ ] **Step 3: Add `missed` to the `Tick` model**

In `habitlab/routes/api.py`, add to the `Tick` model (after line 351):

```python
    missed: bool | None = None
```

- [ ] **Step 4: Pass `missed` through in the completions handler**

In `habitlab/routes/api.py`, the non-sub-goal branch (currently line 406):

```python
    record = await habit.tick(
        day, done=tick.done, text=tick.text, count=tick.count, missed=tick.missed
    )
```

- [ ] **Step 5: Add `missed` to both record serializers**

In `_record_to_dict` (line 638-644), add the key:

```python
    return {
        "day": day,
        "done": bool(r.done),
        "count": int(getattr(r, "count", 1 if r.done else 0)),
        "text": getattr(r, "text", "") or "",
        "sub_goals_done": getattr(r, "sub_goals_done", []),
        "missed": bool(getattr(r, "missed", False)),
    }
```

In the inline records serializer inside the `GET /habits` handler (line 143-149), add the key:

```python
            "records": [
                {
                    "day": r.day.strftime("%Y-%m-%d"),
                    "done": r.done,
                    "count": r.count,
                    "sub_goals_done": r.sub_goals_done,
                    "missed": r.missed,
                }
                for r in x.records
            ],
```

- [ ] **Step 6: Run test to verify it passes**

Run: `uv run pytest tests/test_apis.py::test_completion_missed_roundtrip -v`
Expected: PASS

- [ ] **Step 7: Confirm stats are unaffected**

Run: `uv run pytest tests/test_stats.py -v`
Expected: PASS (no changes to stats logic; a missed day has count 0 and is naturally excluded).

- [ ] **Step 8: Commit**

```bash
git add habitlab/routes/api.py tests/test_apis.py
git commit -m "feat: accept and serialize missed flag on completions"
```

---

### Task 4: Shared `daymenu.js` context-menu module

**Files:**
- Create: `habitlab/static/js/daymenu.js`

- [ ] **Step 1: Create the module**

Create `habitlab/static/js/daymenu.js`:

```js
// Shared 3-option day context menu (Completed / Not completed / Clear).
// Reuses the existing .ctx-menu CSS class. Singleton appended to <body>.

let _menu = null;

function ensureMenu() {
    if (_menu) return _menu;
    const m = document.createElement('div');
    m.className = 'ctx-menu day-menu';
    m.style.display = 'none';
    m.innerHTML = `
        <div class="ctx-menu-item" data-action="complete"><span class="day-menu-dot ok">✓</span>Completed</div>
        <div class="ctx-menu-item" data-action="miss"><span class="day-menu-dot bad">✕</span>Not completed</div>
        <div class="ctx-menu-item" data-action="clear"><span class="day-menu-dot mut">○</span>Clear</div>
    `;
    document.body.appendChild(m);
    _menu = m;
    return m;
}

export function closeDayMenu() {
    if (_menu) _menu.style.display = 'none';
}

export function openDayMenu(x, y, { onComplete, onMissed, onClear }) {
    const m = ensureMenu();
    const handlers = { complete: onComplete, miss: onMissed, clear: onClear };

    // Rebind click handlers fresh each open (callbacks capture current day).
    m.querySelectorAll('.ctx-menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            closeDayMenu();
            handlers[item.dataset.action]?.();
        };
    });

    m.style.display = 'block';
    // Clamp to viewport.
    const rect = m.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    m.style.left = `${Math.max(8, left)}px`;
    m.style.top = `${Math.max(8, top)}px`;

    // Close on outside click / Escape (next tick so this open click doesn't close it).
    setTimeout(() => {
        const onDocClick = () => { closeDayMenu(); cleanup(); };
        const onKey = (e) => { if (e.key === 'Escape') { closeDayMenu(); cleanup(); } };
        function cleanup() {
            document.removeEventListener('click', onDocClick, true);
            document.removeEventListener('keydown', onKey);
        }
        document.addEventListener('click', onDocClick, { capture: true, once: true });
        document.addEventListener('keydown', onKey, { once: true });
    }, 0);
}
```

- [ ] **Step 2: Commit**

```bash
git add habitlab/static/js/daymenu.js
git commit -m "feat: shared day context-menu module (daymenu.js)"
```

(No unit test — the project has no JS unit harness for these modules; behavior is verified manually in Task 7.)

---

### Task 5: Calendar — right-click menu + ✕ rendering (`monthly.js`)

**Files:**
- Modify: `habitlab/static/js/monthly.js` (map build line 32; cell build lines 91-110; `paintCalCircle` lines 113-148; `onCalCircleClick` ~150)

- [ ] **Step 1: Carry `missed` in `recordsByDay`**

In `monthly.js`, the map-build line (line 32) becomes:

```js
        map.set(r.day, { count: r.count, done: r.done, sub_goals_done: r.sub_goals_done || [], missed: r.missed || false });
```

Also update the two `recordsByDay.get(iso) || {...}` fallback defaults (lines 94 and 160) to include `missed: false`:

```js
        const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [], missed: false };
```

- [ ] **Step 2: Render the ✕ in `paintCalCircle`**

In `paintCalCircle` (after the future-guard early return, before the `if (rec.done || rec.count >= target)` block at line 129), add:

```js
    if (rec.missed && !rec.done && rec.count < target) {
        cell.classList.add('missed');
        const x = document.createElement('span');
        x.className = 'cal-x';
        x.textContent = '✕';
        cell.appendChild(x);
        return;
    }
```

And add `'missed'` to the `classList.remove(...)` call at line 114:

```js
    cell.classList.remove('done', 'partial', 'missed');
```

- [ ] **Step 3: Add the contextmenu trigger on non-future cells**

In the cell-build loop, inside the `if (!isFuture) { ... }` block (line 106-108), add a contextmenu listener next to the existing click listener:

```js
        if (!isFuture) {
            cell.addEventListener('click', () => onCalCircleClick(cell, iso));
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCalDayMenu(cell, iso, e.clientX, e.clientY);
            });
        }
```

- [ ] **Step 4: Import the shared menu and add the handler**

At the top of `monthly.js`, add to the import line (line 2):

```js
import { openDayMenu } from '/static/js/daymenu.js';
```

Add a new function (next to `onCalCircleClick`):

```js
function openCalDayMenu(cell, iso, x, y) {
    if (!calState) return;
    const { habitId, subGoals, target, recordsByDay } = calState;

    async function send(body) {
        try {
            const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
                date: iso, date_fmt: '%Y-%m-%d', ...body,
            });
            const prev = recordsByDay.get(iso) || { done: false };
            const newRec = {
                count: result.count,
                done: result.done,
                sub_goals_done: result.sub_goals_done || [],
                missed: result.missed || false,
            };
            recordsByDay.set(iso, newRec);
            paintCalCircle(cell, newRec, subGoals, target);
            calState.onToggle?.(iso);
            document.dispatchEvent(new CustomEvent('cal:toggled', {
                detail: { habitId, iso, newRec, prevDone: prev.done },
            }));
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    openDayMenu(x, y, {
        onComplete: () => send({ done: true }),
        onMissed:   () => send({ missed: true }),
        onClear:    () => send({ missed: false, done: false }),
    });
}
```

Note: the `cal:toggled` consumer in `habits.js` reads `newRec` for in-memory updates; `missed` is now included so the stored record stays accurate. No `habits.js` change is required because stats ignore `missed`.

- [ ] **Step 5: Commit**

```bash
git add habitlab/static/js/monthly.js
git commit -m "feat: right-click missed/clear menu and ✕ rendering on calendar"
```

---

### Task 6: Today tab — menu trigger + ✕ circle (`today.js`)

**Files:**
- Modify: `habitlab/static/js/today.js` (imports; habit-row build ~line 243; circle rendering; add helpers)

- [ ] **Step 1: Import the shared menu**

Add near the top imports of `today.js`:

```js
import { openDayMenu } from '/static/js/daymenu.js';
```

- [ ] **Step 2: Add a helper that opens the menu for a habit on `viewDay`**

Add this function in `today.js` (near `toggleHabit`, line 667):

```js
function openHabitDayMenu(h, x, y) {
    if (viewDay > TODAY) return; // no future marking
    async function send(body) {
        _inflight++; render();
        try {
            const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
                date: viewDay, date_fmt: '%Y-%m-%d', ...body,
            });
            const habit = allHabits.find(x => x.id === h.id);
            if (habit) {
                const existing = habit.records.find(r => r.day === viewDay);
                const patch = {
                    done: result.done,
                    count: result.count,
                    missed: result.missed || false,
                    sub_goals_done: result.sub_goals_done || [],
                };
                if (existing) Object.assign(existing, patch);
                else habit.records.push({ day: viewDay, ...patch });
            }
        } catch (err) {
            toast(err?.message || 'Failed to update habit', 'error');
        } finally {
            _inflight--; render();
        }
    }
    openDayMenu(x, y, {
        onComplete: () => send({ done: true }),
        onMissed:   () => send({ missed: true }),
        onClear:    () => send({ missed: false, done: false }),
    });
}
```

- [ ] **Step 3: Wire desktop right-click + touch long-press on the habit row**

In the habit-row build (after line 244 `row.addEventListener('click', ...)`), add:

```js
        // Desktop right-click → day menu
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openHabitDayMenu(h, e.clientX, e.clientY);
        });

        // Touch long-press → day menu (cancelled on move / scroll)
        let pressTimer = null, startX = 0, startY = 0, longFired = false;
        row.addEventListener('touchstart', (e) => {
            longFired = false;
            const t = e.touches[0];
            startX = t.clientX; startY = t.clientY;
            pressTimer = setTimeout(() => {
                longFired = true;
                openHabitDayMenu(h, startX, startY);
            }, 500);
        }, { passive: true });
        row.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
                clearTimeout(pressTimer);
            }
        }, { passive: true });
        const cancelPress = () => clearTimeout(pressTimer);
        row.addEventListener('touchend', cancelPress);
        row.addEventListener('touchcancel', cancelPress);
        // Swallow the click that follows a long-press so it doesn't also toggle complete.
        row.addEventListener('click', (e) => { if (longFired) { e.stopPropagation(); longFired = false; } }, true);
```

Note: the capture-phase click swallower must be added BEFORE the existing bubble-phase `row.addEventListener('click', ...)` toggle — capture runs first, so it can stop the toggle when a long-press just fired.

- [ ] **Step 4: Render the ✕ in the habit circle**

The existing render loop (lines 231-232) already defines `rec` and `isDone`. Add `isMissed` right after them:

```js
        const rec = h.records.find(r => r.day === viewDay);
        const isDone = rec && rec.done;
        const isMissed = rec && rec.missed && !rec.done;
```

Update the row class line (currently line 243) to include the missed class:

```js
        row.className = 'tl-habit-row' + (busy ? ' busy' : '') + (isDone ? ' done' : '') + (isMissed ? ' missed' : '');
```

Update the circle-building block (currently lines 251-257) to add the missed branch between done and the icon fallback:

```js
        const circle = document.createElement('div');
        circle.className = 'tl-habit-circle' + (isDone ? ' done' : '') + (isMissed ? ' missed' : '');
        if (isDone) {
            circle.innerHTML = checkmarkSvg(11);
        } else if (isMissed) {
            const x = document.createElement('span');
            x.className = 'tl-x';
            x.textContent = '✕';
            circle.appendChild(x);
        } else {
            circle.appendChild(buildIconEl(h.icon || '📌', 13));
        }
```

- [ ] **Step 5: Commit**

```bash
git add habitlab/static/js/today.js
git commit -m "feat: Today tab long-press/right-click missed menu and ✕ circle"
```

---

### Task 7: CSS — missed states + menu dots

**Files:**
- Modify: `habitlab/static/css/styles.css`

- [ ] **Step 1: Add the styles**

Append to `habitlab/static/css/styles.css` (near the existing `.cal-circle` and `.tl-habit-circle` rules):

```css
/* Missed-day state */
.cal-circle.missed { color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent); }
.cal-circle .cal-x { font-weight: 600; font-size: 13px; }

.tl-habit-circle .tl-x { color: var(--danger); font-weight: 600; font-size: 14px; }
.tl-habit-circle.missed { border-color: color-mix(in srgb, var(--danger) 45%, transparent); color: var(--danger); }
.tl-habit-row.missed .tl-habit-name { color: var(--text-secondary); }

/* Day context-menu dots */
.day-menu-dot { display: inline-block; width: 16px; text-align: center; margin-right: 8px; }
.day-menu-dot.ok  { color: var(--success); }
.day-menu-dot.bad { color: var(--danger); }
.day-menu-dot.mut { color: var(--text-muted); }
```

- [ ] **Step 2: Commit**

```bash
git add habitlab/static/css/styles.css
git commit -m "style: missed-day ✕ states and day-menu dots"
```

---

### Task 8: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Launch the app**

Run: `uv run uvicorn habitlab.main:app --reload --port 8765`
Open `http://localhost:8765`.

- [ ] **Step 2: Verify the monthly calendar**

On a habit's detail panel:
- Right-click a past day → menu appears with Completed / Not completed / Clear.
- Click **Not completed** → day shows a red ✕.
- Reload the page → ✕ persists.
- Right-click the ✕ day → **Clear** → returns to blank.
- Right-click the ✕ day → **Completed** → turns green ✓ (✕ cleared).
- Confirm right-clicking a **future** day shows no menu.
- Confirm All-time % / Monthly % / streak are unchanged by a missed day vs. a blank day.

- [ ] **Step 3: Verify the Today tab**

- Right-click (desktop) a pinned habit row → same menu.
- **Not completed** → the habit circle shows a red ✕.
- Reload → persists; open the same habit's calendar → same day shows ✕ (shared record).
- Tap (left-click) the row → completes normally (✕ cleared) — confirms the fast path is intact.
- On a touch device (or devtools touch emulation): long-press a row → menu; a scroll/drag gesture does NOT open it.
- Navigate to a future day → long-press/right-click does nothing.

- [ ] **Step 4: Run the full backend suite once more**

Run: `uv run pytest -q`
Expected: PASS.

---

## Notes for the implementer

- **Date handling:** all client posts use `date_fmt: '%Y-%m-%d'` and `viewDay`/`iso` are already local-ISO strings — never call `toISOString().slice()`.
- **Stats are intentionally untouched.** If a test or behavior suggests missed days should affect a percentage, stop — that contradicts the spec ("act the same as a missed day").
- **No new CSS class for the menu container** — `daymenu.js` reuses the existing `.ctx-menu` class; only the dot spans are new.
