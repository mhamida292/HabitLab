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

// "Tuesday, 26 May" style label for header
function headerDateLabel(iso) {
    const d = new Date(iso + 'T00:00:00');
    const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
    const day = d.getDate();
    const month = d.toLocaleDateString('en-GB', { month: 'long' });
    return `${weekday}, ${day} ${month}`;
}

// Returns last 7 days ending on referenceIso (rolling window)
function getLast7Days(referenceIso) {
    return Array.from({ length: 7 }, (_, i) => isoAddDays(referenceIso, i - 6));
}

// Short day label (2 chars) from ISO
function shortDay(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);
}

// Checkmark SVG for done circles
function checkmarkSvg(size) {
    return `<svg viewBox="0 0 12 12" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6l3 3 5-5"/></svg>`;
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

// ── Shared stats helper ────────────────────────────────────────────────────────
function computeStats(day) {
    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
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
}

// Header: ← Today — Weekday, D Month → | N / M done
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
    nextBtn.disabled = viewDay === TODAY;
    nextBtn.addEventListener('click', () => navigateDay(1));

    const countEl = document.createElement('span');
    countEl.className = 'tl-done-count';
    countEl.textContent = `${done} / ${total} done`;

    header.append(prevBtn, label, nextBtn, countEl);
    el.appendChild(header);

    // Past-day banner
    document.querySelector('.tl-past-banner')?.remove();
    if (viewDay !== TODAY) {
        const banner = document.createElement('div');
        banner.className = 'tl-past-banner';
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
    const { done, total } = computeStats(viewDay);
    fill.style.width = total > 0 ? `${(done / total) * 100}%` : '0%';
}

function renderHabitPins() {
    const el = document.getElementById('todayPins');
    if (!el) return;
    el.innerHTML = '';

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    if (pinned.length === 0) return;

    pinned.forEach(h => {
        const rec = h.records.find(r => r.day === viewDay);
        const isDone = rec && rec.done;
        const hasSg = h.sub_goals && h.sub_goals.length > 0;
        const busy = _inflight > 0;

        // Habit row — clicking anywhere toggles
        const row = document.createElement('div');
        row.className = 'tl-habit-row' + (busy ? ' busy' : '') + (isDone ? ' done' : '');
        row.addEventListener('click', () => { if (!busy) toggleHabit(h); });

        // Custom circle: icon inside when unchecked, checkmark when done
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

        // Badge: "N/M" for sub-goal habits, "habit" otherwise — always accent styled
        const badge = document.createElement('span');
        badge.className = 'tl-habit-badge';
        if (hasSg) {
            const doneSgs = rec?.sub_goals_done?.length || 0;
            badge.textContent = `${doneSgs}/${h.sub_goals.length}`;
        } else {
            badge.textContent = 'habit';
        }

        row.append(circle, name, badge);
        el.appendChild(row);

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
            el.appendChild(pills);
        }
    });
    applyIcons();
}

function renderTaskList() {
    const el = document.getElementById('todayList');
    if (!el) return;
    el.innerHTML = '';

    const busy = _inflight > 0;

    taskItems.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tl-task-row' + (busy ? ' busy' : '') + (t.done ? ' done' : '');
        row.addEventListener('click', () => { if (!busy) toggleTask(t.id); });

        // Custom task circle
        const circle = document.createElement('div');
        circle.className = 'tl-task-circle' + (t.done ? ' done' : '');
        if (t.done) {
            circle.innerHTML = checkmarkSvg(9);
        }

        const text = document.createElement('span');
        text.className = 'tl-task-name';
        text.textContent = t.carriedFrom
            ? `${t.text} ↑ ${isoLabel(t.carriedFrom)}`
            : t.text;

        row.append(circle, text);

        if (viewDay === TODAY) {
            const delBtn = document.createElement('button');
            delBtn.className = 'tl-task-del';
            delBtn.textContent = '×';
            delBtn.addEventListener('click', e => { e.stopPropagation(); deleteTask(t.id); });
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

    const row = document.createElement('div');
    row.className = 'tl-add-row';

    const plus = document.createElement('span');
    plus.className = 'tl-add-plus';
    plus.textContent = '+';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tl-add-input';
    inp.placeholder = 'Add task for today…';
    inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && inp.value.trim()) {
            addTask(inp.value.trim());
        }
    });

    row.append(plus, inp);
    el.appendChild(row);
}

function renderPinControl() {
    const el = document.getElementById('todayPinControl');
    if (!el) return;
    el.innerHTML = '';
    if (allHabits.length === 0) return;

    const divider = document.createElement('div');
    divider.className = 'tl-divider';
    el.appendChild(divider);

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

function renderStatsPanel() {
    const el = document.getElementById('todayStatsPanel');
    if (!el) return;
    el.innerHTML = '';
    if (viewDay !== TODAY) return;

    const { pinned, done, total } = computeStats(TODAY);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // ── TODAY'S PROGRESS ──
    const progLabel = document.createElement('div');
    progLabel.className = 'tr-section-label';
    progLabel.textContent = "Today's Progress";
    el.appendChild(progLabel);

    const cards = document.createElement('div');
    cards.className = 'tr-progress-cards';
    [
        { label: 'Done',     value: done },
        { label: 'Left',     value: total - done },
        { label: 'Complete', value: `${pct}%` },
    ].forEach(c => {
        const card = document.createElement('div');
        card.className = 'tr-card';
        const val = document.createElement('div');
        val.className = 'tr-card-value';
        val.textContent = c.value;
        const lbl = document.createElement('div');
        lbl.className = 'tr-card-label';
        lbl.textContent = c.label;
        card.append(val, lbl);
        cards.appendChild(card);
    });
    el.appendChild(cards);

    // ── HABIT STREAKS ──
    if (pinned.length > 0) {
        const streakLabel = document.createElement('div');
        streakLabel.className = 'tr-section-label';
        streakLabel.textContent = 'Habit Streaks';
        el.appendChild(streakLabel);

        const streakSection = document.createElement('div');
        streakSection.className = 'tr-streak-section';

        pinned.forEach(h => {
            const doneSet = new Set(h.records.filter(r => r.done).map(r => r.day));
            let streak = 0, cursor = TODAY;
            while (doneSet.has(cursor)) {
                streak++;
                cursor = isoAddDays(cursor, -1);
            }

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
            streakSection.appendChild(row);
        });
        el.appendChild(streakSection);
        applyIcons();
    }

    // ── THIS WEEK (rolling last 7 days) ──
    const weekLabel = document.createElement('div');
    weekLabel.className = 'tr-section-label';
    weekLabel.textContent = 'This Week';
    el.appendChild(weekLabel);

    const last7 = getLast7Days(TODAY);
    const MAX_BAR_H = 64; // px

    const barsRow = document.createElement('div');
    barsRow.className = 'tr-week-bars';

    const labelsRow = document.createElement('div');
    labelsRow.className = 'tr-week-labels';

    last7.forEach(iso => {
        const isToday = iso === TODAY;

        // % of pinned habits done that day
        let ratio = 0;
        if (pinned.length > 0) {
            const dayDone = pinned.filter(h => {
                const rec = h.records.find(r => r.day === iso);
                return rec && rec.done;
            }).length;
            ratio = dayDone / pinned.length;
        }

        const barCol = document.createElement('div');
        barCol.className = 'tr-week-bar-col';

        const bar = document.createElement('div');
        const heightPx = Math.max(3, Math.round(ratio * MAX_BAR_H));
        bar.style.height = `${heightPx}px`;
        bar.className = isToday
            ? 'tr-week-bar today-bar'
            : ratio > 0
                ? 'tr-week-bar done-bar'
                : 'tr-week-bar';

        barCol.appendChild(bar);
        barsRow.appendChild(barCol);

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

// Pin toggle: update memory first, then persist
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
