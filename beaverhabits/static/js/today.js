// beaverhabits/static/js/today.js
import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons } from '/static/js/icons.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_FUTURE = 7; // max days ahead that can be planned

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

function headerDateLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    return `${weekday}, ${day} ${month}`;
}

function getLast7Days(referenceIso) {
    return Array.from({ length: 7 }, (_, i) => isoAddDays(referenceIso, i - 6));
}

function shortDay(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

function checkmarkSvg(size) {
    return `<svg viewBox="0 0 12 12" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg>`;
}

// ── State ──────────────────────────────────────────────────────────────────────
const TODAY = localIso();
const MAX_DAY = isoAddDays(TODAY, MAX_FUTURE);
let viewDay = TODAY;
let taskItems = [];
let allHabits = [];
let pinnedIds = [];   // order matters — used for display order
let _inflight = 0;
let _lastRefresh = 0;

// ── Sortable instances ─────────────────────────────────────────────────────────
let _sortHabits = null;
let _sortTasks = null;

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadAll() {
    try {
        const carry = viewDay === TODAY;
        const [tasks, habits, meta] = await Promise.all([
            api.get(`/api/v1/tasks?date=${viewDay}&carry=${carry}`),
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

// ── Shared stats helper ────────────────────────────────────────────────────────
// Respects pinnedIds order so drag-reorder is reflected in stats
function computeStats(day) {
    const pinned = pinnedIds.map(id => allHabits.find(h => h.id === id)).filter(Boolean);
    const habitsDone = pinned.filter(h => {
        const rec = h.records.find(r => r.day === day);
        return rec && rec.done;
    }).length;
    const tasksDone = taskItems.filter(t => t.done).length;
    const total = pinned.length + taskItems.length;
    const done = habitsDone + tasksDone;
    return { pinned, done, total };
}

// ── Render ─────────────────────────────────────────────────────────────────────
function render() {
    renderHeader();
    renderProgress();
    renderHabitPins();
    renderTaskList();
    renderAddRow();
    renderPinControl();
    renderStatsPanel();
    initSortables();
}

// ── Sortable init (after every render) ────────────────────────────────────────
function initSortables() {
    if (typeof Sortable === 'undefined') return;

    _sortHabits?.destroy(); _sortHabits = null;
    _sortTasks?.destroy();  _sortTasks  = null;

    const pinsEl = document.getElementById('todayPins');
    if (pinsEl?.querySelector('.tl-habit-group')) {
        _sortHabits = Sortable.create(pinsEl, {
            handle: '.tl-drag-handle',
            animation: 120,
            draggable: '.tl-habit-group',
            ghostClass: 'tl-sort-ghost',
            onEnd(evt) {
                if (evt.oldIndex === evt.newIndex) return;
                // Read new order from DOM, update state, persist
                pinnedIds = [...pinsEl.querySelectorAll('.tl-habit-group[data-habit-id]')]
                    .map(el => el.dataset.habitId);
                api.put('/api/v1/habits/meta', { pinned_today_ids: pinnedIds })
                    .catch(() => toast('Failed to save habit order', 'error'));
            },
        });
    }

    const listEl = document.getElementById('todayList');
    if (listEl?.querySelector('.tl-task-row')) {
        _sortTasks = Sortable.create(listEl, {
            handle: '.tl-drag-handle',
            animation: 120,
            ghostClass: 'tl-sort-ghost',
            onEnd(evt) {
                if (evt.oldIndex === evt.newIndex) return;
                const moved = taskItems.splice(evt.oldIndex, 1)[0];
                taskItems.splice(evt.newIndex, 0, moved);
            },
        });
    }
}

// ── Header ─────────────────────────────────────────────────────────────────────
function renderHeader() {
    const el = document.getElementById('todayDateNav');
    if (!el) return;
    el.innerHTML = '';

    const { done, total } = computeStats(viewDay);

    const header = document.createElement('div');
    header.className = 'tl-header';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'tl-nav-btn';
    prevBtn.textContent = '←';
    prevBtn.addEventListener('click', () => navigateDay(-1));

    const label = document.createElement('span');
    label.className = 'tl-date';
    label.textContent = viewDay === TODAY
        ? `Today — ${headerDateLabel(viewDay)}`
        : headerDateLabel(viewDay);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'tl-nav-btn';
    nextBtn.textContent = '→';
    nextBtn.disabled = viewDay >= MAX_DAY;
    nextBtn.addEventListener('click', () => navigateDay(1));

    const countEl = document.createElement('span');
    countEl.className = 'tl-done-count';
    countEl.textContent = `${done} / ${total} done`;

    header.append(prevBtn, label, nextBtn, countEl);
    el.appendChild(header);

    document.querySelector('.tl-past-banner')?.remove();
    if (viewDay !== TODAY) {
        const banner = document.createElement('div');
        banner.className = 'tl-past-banner';
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = 'Jump to today';
        link.addEventListener('click', e => { e.preventDefault(); jumpToToday(); });
        const msg = viewDay < TODAY ? 'Viewing a past day' : 'Planning ahead';
        banner.append(`${msg} — `, link);
        el.after(banner);
    }
}

function renderProgress() {
    const fill = document.getElementById('todayProgressFill');
    if (!fill) return;
    const { done, total } = computeStats(viewDay);
    fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
}

// ── Habit pins ──────────────────────────────────────────────────────────────────
function renderHabitPins() {
    const el = document.getElementById('todayPins');
    if (!el) return;
    el.innerHTML = '';

    // Use pinnedIds order — drag-reorder updates this array
    const pinned = pinnedIds.map(id => allHabits.find(h => h.id === id)).filter(Boolean);
    if (pinned.length === 0) return;

    pinned.forEach(h => {
        const rec = h.records.find(r => r.day === viewDay);
        const isDone = rec && rec.done;
        const hasSg = h.sub_goals && h.sub_goals.length > 0;
        const busy = _inflight > 0;

        // Group wrapper — habit row + sub-goal pills move together when dragging
        const group = document.createElement('div');
        group.className = 'tl-habit-group';
        group.dataset.habitId = h.id;

        // Habit row
        const row = document.createElement('div');
        row.className = 'tl-habit-row' + (busy ? ' busy' : '') + (isDone ? ' done' : '');
        row.addEventListener('click', () => { if (!busy) toggleHabit(h); });

        const handle = document.createElement('div');
        handle.className = 'tl-drag-handle';
        handle.textContent = '⠿';
        handle.addEventListener('click', e => e.stopPropagation());

        const circle = document.createElement('div');
        circle.className = 'tl-habit-circle' + (isDone ? ' done' : '');
        if (isDone) {
            circle.innerHTML = checkmarkSvg(11);
        } else {
            circle.appendChild(buildIconEl(h.icon || '📌', 13));
        }

        const name = document.createElement('span');
        name.className = 'tl-habit-name';
        name.textContent = h.name;

        const badge = document.createElement('span');
        badge.className = 'tl-habit-badge';
        badge.textContent = hasSg
            ? `${rec?.sub_goals_done?.length || 0}/${h.sub_goals.length}`
            : 'habit';

        row.append(handle, circle, name, badge);
        group.appendChild(row);

        // Sub-goal pills
        if (hasSg) {
            const pills = document.createElement('div');
            pills.className = 'tl-sg-pills';
            h.sub_goals.forEach(sg => {
                const sgDone = rec?.sub_goals_done?.includes(sg.id);
                const pill = document.createElement('button');
                pill.className = 'tl-sg-pill' + (sgDone ? ' done' : '');
                pill.textContent = sg.name;
                pill.disabled = busy;
                pill.addEventListener('click', e => { e.stopPropagation(); toggleSg(h, sg.id); });
                pills.appendChild(pill);
            });
            group.appendChild(pills);
        }

        el.appendChild(group);
    });
    applyIcons();
}

// ── Task list ───────────────────────────────────────────────────────────────────
function renderTaskList() {
    const el = document.getElementById('todayList');
    if (!el) return;
    el.innerHTML = '';

    const busy = _inflight > 0;
    const editable = !busy && viewDay >= TODAY;

    taskItems.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tl-task-row' + (busy ? ' busy' : '') + (t.done ? ' done' : '');

        const handle = document.createElement('div');
        handle.className = 'tl-drag-handle';
        handle.textContent = '⠿';
        handle.addEventListener('click', e => e.stopPropagation());

        const circle = document.createElement('div');
        circle.className = 'tl-task-circle' + (t.done ? ' done' : '');
        if (t.done) circle.innerHTML = checkmarkSvg(11);
        circle.addEventListener('click', e => { e.stopPropagation(); if (!busy) toggleTask(t.id); });

        const text = document.createElement('span');
        text.className = 'tl-task-name';
        text.textContent = t.carriedFrom
            ? `${t.text} ↑ ${isoLabel(t.carriedFrom)}`
            : t.text;
        if (editable) {
            text.style.cursor = 'text';
            text.addEventListener('click', e => { e.stopPropagation(); enterEditMode(t, text); });
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'tl-task-del';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', e => { e.stopPropagation(); deleteTask(t.id); });

        row.append(handle, circle, text, delBtn);
        el.appendChild(row);
    });
}

// ── Add row ─────────────────────────────────────────────────────────────────────
function renderAddRow() {
    const el = document.getElementById('todayAddRow');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay < TODAY) return; // read-only for past days

    const row = document.createElement('div');
    row.className = 'tl-add-row';

    const plus = document.createElement('span');
    plus.className = 'tl-add-plus';
    plus.textContent = '+';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tl-add-input';
    inp.placeholder = viewDay === TODAY
        ? 'Add task for today…'
        : `Add task for ${headerDateLabel(viewDay)}…`;
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && inp.value.trim()) addTask(inp.value.trim());
    });

    row.append(plus, inp);
    el.appendChild(row);
}

// ── Pin control ─────────────────────────────────────────────────────────────────
function renderPinControl() {
    const el = document.getElementById('todayPinControl');
    if (!el) return;
    el.innerHTML = '';
    if (allHabits.length === 0) return;

    el.appendChild(Object.assign(document.createElement('div'), { className: 'tl-divider' }));

    const label = document.createElement('div');
    label.className = 'tl-pin-label';
    label.textContent = 'Pin habits to today';
    el.appendChild(label);

    allHabits.forEach(h => {
        const row = document.createElement('label');
        row.className = 'tl-pin-row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = pinnedIds.includes(h.id);
        cb.addEventListener('change', () => togglePin(h.id));

        const iconWrap = document.createElement('span');
        iconWrap.appendChild(buildIconEl(h.icon || '📌', 13));

        const name = document.createElement('span');
        name.textContent = h.name;

        row.append(cb, iconWrap, name);
        el.appendChild(row);
    });
    applyIcons();
}

// ── Stats panel ─────────────────────────────────────────────────────────────────
function renderStatsPanel() {
    const el = document.getElementById('todayStatsPanel');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const { pinned, done, total } = computeStats(TODAY);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Progress cards
    const progLabel = document.createElement('div');
    progLabel.className = 'tr-section-label';
    progLabel.textContent = "Today's Progress";
    el.appendChild(progLabel);

    const cards = document.createElement('div');
    cards.className = 'tr-progress-cards';
    [{ label: 'Done', value: done }, { label: 'Left', value: total - done }, { label: 'Complete', value: `${pct}%` }]
        .forEach(c => {
            const card = document.createElement('div');
            card.className = 'tr-card';
            card.innerHTML = `<div class="tr-card-value">${c.value}</div><div class="tr-card-label">${c.label}</div>`;
            cards.appendChild(card);
        });
    el.appendChild(cards);

    // Streaks
    if (pinned.length > 0) {
        const streakLabel = document.createElement('div');
        streakLabel.className = 'tr-section-label';
        streakLabel.textContent = 'Habit Streaks';
        el.appendChild(streakLabel);

        const section = document.createElement('div');
        section.className = 'tr-streak-section';
        pinned.forEach(h => {
            const doneSet = new Set(h.records.filter(r => r.done).map(r => r.day));
            let streak = 0, cursor = TODAY;
            while (doneSet.has(cursor)) { streak++; cursor = isoAddDays(cursor, -1); }

            const row = document.createElement('div');
            row.className = 'tr-streak-row';

            const iconWrap = document.createElement('span');
            iconWrap.appendChild(buildIconEl(h.icon || '📌', 13));

            const name = document.createElement('span');
            name.className = 'tr-streak-name';
            name.textContent = h.name;

            const count = document.createElement('span');
            count.className = 'tr-streak-count' + (streak === 0 ? ' zero' : '');
            count.textContent = streak === 0 ? '— 0' : `🔥 ${streak}`;

            row.append(iconWrap, name, count);
            section.appendChild(row);
        });
        el.appendChild(section);
        applyIcons();
    }

    // Weekly bar chart (rolling last 7 days)
    const weekLabel = document.createElement('div');
    weekLabel.className = 'tr-section-label';
    weekLabel.textContent = 'This Week';
    el.appendChild(weekLabel);

    const last7 = getLast7Days(TODAY);
    const MAX_H = 64;
    const barsRow = document.createElement('div');
    barsRow.className = 'tr-week-bars';
    const labelsRow = document.createElement('div');
    labelsRow.className = 'tr-week-labels';

    last7.forEach(iso => {
        const isToday = iso === TODAY;
        let ratio = 0;
        if (pinned.length > 0) {
            const dayDone = pinned.filter(h => {
                const rec = h.records.find(r => r.day === iso);
                return rec && rec.done;
            }).length;
            ratio = dayDone / pinned.length;
        }

        const col = document.createElement('div');
        col.className = 'tr-week-bar-col';
        const bar = document.createElement('div');
        bar.style.height = `${Math.max(3, Math.round(ratio * MAX_H))}px`;
        bar.className = isToday ? 'tr-week-bar today-bar' : ratio > 0 ? 'tr-week-bar done-bar' : 'tr-week-bar';
        col.appendChild(bar);
        barsRow.appendChild(col);

        const lbl = document.createElement('div');
        lbl.className = 'tr-week-lbl' + (isToday ? ' today-lbl' : '');
        lbl.textContent = shortDay(iso);
        labelsRow.appendChild(lbl);
    });

    el.appendChild(barsRow);
    el.appendChild(labelsRow);
}

// ── Day navigation ─────────────────────────────────────────────────────────────
async function navigateDay(delta) {
    const candidate = isoAddDays(viewDay, delta);
    if (candidate > MAX_DAY) return;
    viewDay = candidate;
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${viewDay}&carry=${viewDay === TODAY}`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

async function jumpToToday() {
    viewDay = TODAY;
    try {
        taskItems = await api.get(`/api/v1/tasks?date=${TODAY}&carry=true`);
        _lastRefresh = Date.now();
    } catch (err) {
        toast(err?.message || 'Failed to load tasks', 'error');
    }
    render();
}

// ── Mutations — Lockbox pattern ────────────────────────────────────────────────
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

async function updateTaskText(id, newText) {
    _inflight++;
    render();
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { text: newText });
        taskItems.find(t => t.id === id).text = updated.text;
    } catch (err) {
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _inflight--;
        render();
    }
}

function enterEditMode(t, textSpan) {
    if (_inflight > 0) return;
    let saved = false;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tl-task-edit-input';
    input.value = t.text;
    textSpan.replaceWith(input);
    input.focus();
    input.select();

    function save() {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== t.text) {
            updateTaskText(t.id, val);
        } else {
            render(); // restore original (empty or unchanged)
        }
    }

    function cancel() {
        if (saved) return;
        saved = true;
        render();
    }

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { cancel(); }
    });
    input.addEventListener('blur', save);
}

async function toggleHabit(h) {
    const rec = h.records.find(r => r.day === viewDay);
    const currentlyDone = rec && rec.done;
    _inflight++;
    render();
    try {
        const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay, date_fmt: '%Y-%m-%d', done: !currentlyDone,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done; existing.count = result.count;
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
            date: viewDay, date_fmt: '%Y-%m-%d', sub_goal_id: sgId,
        });
        const habit = allHabits.find(x => x.id === h.id);
        if (habit) {
            const existing = habit.records.find(r => r.day === viewDay);
            if (existing) {
                existing.done = result.done;
                existing.count = result.count;
                existing.sub_goals_done = result.sub_goals_done;
            } else {
                habit.records.push({ day: viewDay, done: result.done, count: result.count, sub_goals_done: result.sub_goals_done });
            }
        }
    } catch (err) {
        toast(err?.message || 'Failed to update sub-goal', 'error');
    } finally {
        _inflight--;
        render();
    }
}

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

// ── Silent refresh ─────────────────────────────────────────────────────────────
function silentRefresh() {
    if (viewDay !== TODAY) return;
    if (_inflight > 0 || Date.now() - _lastRefresh < 3000) return;
    _lastRefresh = Date.now();
    (async () => {
        try {
            const fresh = await api.get(`/api/v1/tasks?date=${TODAY}&carry=true`);
            if (_inflight === 0 && viewDay === TODAY) { taskItems = fresh; render(); }
        } catch { /* silent */ }
    })();
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await loadAll();
    window.addEventListener('focus', silentRefresh);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) silentRefresh(); });
});
