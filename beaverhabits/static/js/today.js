// beaverhabits/static/js/today.js
import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons } from '/static/js/icons.js';

// ── Utils ──────────────────────────────────────────────────────────────────────
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isoAddDays(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return localIso(d);
}

function isoLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── State ──────────────────────────────────────────────────────────────────────
const TODAY = localIso();
let viewDay = TODAY;
let taskItems = [];   // [{ id, text, done, date, carriedFrom? }]
let allHabits = [];   // full habit array from GET /api/v1/habits
let pinnedIds = [];   // habit IDs from GET /api/v1/habits/meta .pinned_today_ids
let _inflight = 0;    // mutation guard — blocks silentRefresh while > 0
let _lastRefresh = 0; // ms timestamp of last refresh

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadAll() {
    try {
        const [tasks, habits, meta] = await Promise.all([
            api.get(`/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`),
            api.get('/api/v1/habits'),
            api.get('/api/v1/habits/meta'),
        ]);
        taskItems = tasks;
        allHabits = habits;
        pinnedIds = meta.pinned_today_ids || [];
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load', 'error');
    }
    render();
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
    renderDateNav();
    renderProgress();
    renderHabitPins();
    renderTaskList();
    renderAddRow();
    renderPinControl();
    renderStatsPanel();
}

function renderDateNav() {
    const el = document.getElementById('todayDateNav');
    if (!el) return;
    el.innerHTML = '';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'today-nav-btn';
    prevBtn.textContent = '←';
    prevBtn.addEventListener('click', () => navigateDay(-1));

    const label = document.createElement('span');
    label.className = 'today-date-label';
    label.textContent = viewDay === TODAY ? 'Today' : isoLabel(viewDay);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'today-nav-btn';
    nextBtn.textContent = '→';
    nextBtn.disabled = viewDay === TODAY;
    nextBtn.addEventListener('click', () => navigateDay(1));

    el.append(prevBtn, label, nextBtn);

    // Remove existing banner if present
    document.querySelector('.today-past-banner')?.remove();

    if (viewDay !== TODAY) {
        const banner = document.createElement('div');
        banner.className = 'today-past-banner';
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = 'Jump to today';
        link.addEventListener('click', e => { e.preventDefault(); jumpToToday(); });
        banner.append('Viewing a past day — ', link);
        el.after(banner);
    }
}

function renderProgress() {
    const fill = document.getElementById('todayProgressFill');
    if (!fill) return;
    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === viewDay);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
}

function renderHabitPins() {
    const el = document.getElementById('todayPins');
    if (!el) return;
    el.innerHTML = '';

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));

    if (pinned.length > 0) {
        const header = document.createElement('div');
        header.className = 'today-section-header';
        header.textContent = 'Habits';
        el.appendChild(header);

        pinned.forEach(h => {
            const rec = h.records.find(r => r.day === viewDay);
            const isDone = rec && rec.done;
            const hasSg = h.sub_goals && h.sub_goals.length > 0;

            const row = document.createElement('div');
            row.className = 'task-row habit-pin-row' + (_inflight > 0 ? ' busy' : '') + (isDone ? ' done' : '');

            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-cb';
            cb.checked = isDone;
            cb.disabled = _inflight > 0;
            cb.addEventListener('change', () => toggleHabit(h));

            const iconEl = buildIconEl(h.icon || '📌', 16);

            const name = document.createElement('span');
            name.className = 'task-text';
            name.textContent = h.name;

            row.append(cb, iconEl, name);
            el.appendChild(row);

            if (hasSg) {
                const pills = document.createElement('div');
                pills.className = 'sg-pills';
                h.sub_goals.forEach(sg => {
                    const sgDone = rec?.sub_goals_done?.includes(sg.id);
                    const pill = document.createElement('button');
                    pill.className = 'sg-pill' + (sgDone ? ' done' : '');
                    pill.textContent = sg.name;
                    pill.disabled = _inflight > 0;
                    pill.addEventListener('click', () => toggleSg(h, sg.id));
                    pills.appendChild(pill);
                });
                el.appendChild(pills);
            }
        });
        applyIcons();
    }

}

function renderTaskList() {
    const el = document.getElementById('todayList');
    if (!el) return;
    el.innerHTML = '';

    if (taskItems.length > 0) {
        const header = document.createElement('div');
        header.className = 'today-section-header';
        header.textContent = 'Tasks';
        el.appendChild(header);
    }

    taskItems.forEach(t => {
        const row = document.createElement('div');
        row.className = 'task-row' + (_inflight > 0 ? ' busy' : '') + (t.done ? ' done' : '');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'task-cb';
        cb.checked = t.done;
        cb.disabled = _inflight > 0;
        cb.addEventListener('change', () => toggleTask(t.id));

        const text = document.createElement('span');
        text.className = 'task-text';
        text.textContent = t.carriedFrom
            ? `${t.text} ↑ ${isoLabel(t.carriedFrom)}`
            : t.text;

        row.append(cb, text);

        if (viewDay === TODAY) {
            const delBtn = document.createElement('button');
            delBtn.className = 'task-del-btn';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', () => deleteTask(t.id));
            row.appendChild(delBtn);
        }

        el.appendChild(row);
    });
}

function renderAddRow() {
    const el = document.getElementById('todayAddRow');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'today-add-input';
    inp.placeholder = 'Add task for today…';
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && inp.value.trim()) {
            addTask(inp.value.trim());
        }
    });
    el.appendChild(inp);
}

function renderStatsPanel() {
    const el = document.getElementById('todayStatsPanel');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === TODAY);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Progress cards
    const grid = document.createElement('div');
    grid.className = 'stats-cards';
    [
        { label: 'Done', value: done },
        { label: 'Left', value: total - done },
        { label: '% Done', value: `${pct}%` },
    ].forEach(c => {
        const card = document.createElement('div');
        card.className = 'stats-card';
        const val = document.createElement('div');
        val.className = 'stats-card-value';
        val.textContent = c.value;
        const lbl = document.createElement('div');
        lbl.className = 'stats-card-label';
        lbl.textContent = c.label;
        card.append(val, lbl);
        grid.appendChild(card);
    });
    el.appendChild(grid);

    // Habit streaks
    if (pinned.length > 0) {
        const hdr = document.createElement('div');
        hdr.className = 'stats-section-header';
        hdr.textContent = 'Habit streaks';
        el.appendChild(hdr);

        pinned.forEach(h => {
            const doneSet = new Set(h.records.filter(r => r.done).map(r => r.day));
            let streak = 0, cursor = TODAY;
            while (doneSet.has(cursor)) {
                streak++;
                cursor = isoAddDays(cursor, -1);
            }

            const row = document.createElement('div');
            row.className = 'streak-row';
            const iconEl = buildIconEl(h.icon || '📌', 14);
            const name = document.createElement('span');
            name.className = 'streak-name';
            name.textContent = h.name;
            const flame = document.createElement('span');
            flame.className = 'streak-count';
            flame.textContent = `🔥 ${streak}`;
            row.append(iconEl, name, flame);
            el.appendChild(row);
        });
        applyIcons();
    }
}

function renderPinControl() {
    const el = document.getElementById('todayPinControl');
    if (!el) return;
    el.innerHTML = '';
    if (allHabits.length === 0) return;

    const pinSection = document.createElement('details');
    pinSection.className = 'pin-section';
    const summary = document.createElement('summary');
    summary.textContent = `Pin habits to today (${pinnedIds.length}/${allHabits.length})`;
    pinSection.appendChild(summary);

    allHabits.forEach(h => {
        const row = document.createElement('label');
        row.className = 'pin-habit-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pinnedIds.includes(h.id);
        cb.addEventListener('change', () => togglePin(h.id));

        const iconEl = buildIconEl(h.icon || '📌', 14);

        const name = document.createElement('span');
        name.textContent = h.name;

        row.append(cb, iconEl, name);
        pinSection.appendChild(row);
    });

    el.appendChild(pinSection);
    applyIcons();
}

// ── Day navigation ─────────────────────────────────────────────────────────────
async function navigateDay(delta) {
    if (delta > 0 && viewDay >= TODAY) return;
    viewDay = isoAddDays(viewDay, delta);
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${viewDay}&carry=false`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

async function jumpToToday() {
    viewDay = TODAY;
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${viewDay}&carry=true`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

// ── Mutations — Lockbox pattern throughout ─────────────────────────────────────
async function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (!t) return;
    _inflight++;
    render();
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { done: !t.done });
        t.done = updated.done;
    } catch (err) {
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function addTask(text) {
    _inflight++;
    render();
    try {
        const created = await api.post('/api/v1/tasks', { text, date: viewDay });
        taskItems.push(created);
    } catch (err) {
        toast(err?.message || 'Failed to add task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function deleteTask(id) {
    _inflight++;
    render();
    try {
        await api.delete(`/api/v1/tasks/${id}`);
        taskItems = taskItems.filter(t => t.id !== id);
    } catch (err) {
        toast(err?.message || 'Failed to delete task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function toggleHabit(h) {
    const rec = h.records.find(r => r.day === viewDay);
    const currentlyDone = rec && rec.done;
    _inflight++;
    render();
    try {
        const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay,
            date_fmt: '%Y-%m-%d',
            done: !currentlyDone,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done;
                existing.count = result.count;
            } else {
                habit.records.push({ day: viewDay, done: result.done, count: result.count, sub_goals_done: [] });
            }
        }
    } catch (err) {
        toast(err?.message || 'Failed to update habit', 'error');
    } finally {
        _inflight--;
        render();
    }
}

async function toggleSg(h, sgId) {
    _inflight++;
    render();
    try {
        const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay,
            date_fmt: '%Y-%m-%d',
            sub_goal_id: sgId,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done;
                existing.count = result.count;
                existing.sub_goals_done = result.sub_goals_done;
            } else {
                habit.records.push({
                    day: viewDay,
                    done: result.done,
                    count: result.count,
                    sub_goals_done: result.sub_goals_done,
                });
            }
        }
    } catch (err) {
        toast(err?.message || 'Failed to update sub-goal', 'error');
    } finally {
        _inflight--;
        render();
    }
}

// Pin toggle: update memory first (preference, not critical), then persist
async function togglePin(habitId) {
    if (pinnedIds.includes(habitId)) {
        pinnedIds = pinnedIds.filter(id => id !== habitId);
    } else {
        pinnedIds = [...pinnedIds, habitId];
    }
    render();
    try {
        await api.put('/api/v1/habits/meta', { pinned_today_ids: pinnedIds });
    } catch (err) {
        toast('Failed to save pin — reload to resync', 'error');
    }
}

// ── Silent refresh — syncs tasks across devices ────────────────────────────────
function silentRefresh() {
    if (_inflight > 0 || Date.now() - _lastRefresh < 3000) return;
    _lastRefresh = Date.now();
    (async () => {
        try {
            const fresh = await api.get(
                `/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`
            );
            if (_inflight === 0) {
                taskItems = fresh;
                render();
            }
        } catch { /* silent */ }
    })();
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    window.addEventListener('focus', silentRefresh);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) silentRefresh();
    });
});
