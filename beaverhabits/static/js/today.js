// beaverhabits/static/js/today.js — Daily task list
import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons } from '/static/js/icons.js';

// ── Date helpers ─────────────────────────────────────────────
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoAddDays(iso, n) {
    const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return localIso(d);
}
function fmtDisplay(iso) {
    const d = new Date(iso + 'T00:00:00');
    const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months= ['January','February','March','April','May','June','July','August','September','October','November','December'];
    if (iso === TODAY) return `Today — ${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    if (iso === isoAddDays(TODAY, -1)) return `Yesterday — ${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const TODAY = localIso();

// ── Storage keys ──────────────────────────────────────────────
const PINNED_KEY        = 'hl-today-pinned';
const TASK_MIGRATED_KEY = 'hl-tasks-migrated-v1'; // set after one-time localStorage→server migration

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

// ── One-time migration: localStorage tasks → server ────────────
// Pre-migration today.js stored tasks in `hl-today-tasks-YYYY-MM-DD`.
// This runs once on first load of the server-side code and POSTs any
// undone tasks to the API so they appear normally and PATCH doesn't 404.
async function migrateLocalTasks() {
    if (localStorage.getItem(TASK_MIGRATED_KEY)) return;

    const toMigrate = [];
    for (let i = 0; i <= 14; i++) {
        const iso = isoAddDays(TODAY, -i);
        try {
            const raw = localStorage.getItem(`hl-today-tasks-${iso}`);
            if (!raw) continue;
            const tasks = JSON.parse(raw);
            for (const t of tasks) {
                if (t.text?.trim() && !t.done) {
                    toMigrate.push({ text: t.text.trim(), date: iso });
                }
            }
        } catch {}
    }

    // Best-effort upload — individual failures are silently skipped
    for (const task of toMigrate) {
        try { await api.post('/api/v1/tasks', task); } catch {}
    }

    // Flag as migrated whether or not every post succeeded, to avoid
    // retrying on every subsequent page load
    localStorage.setItem(TASK_MIGRATED_KEY, '1');
}

// ── Task API ──────────────────────────────────────────────────
async function fetchTasks(iso, carry = false) {
    return await api.get(`/api/v1/tasks?date=${iso}${carry ? '&carry=true' : ''}`);
}

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

// ── Habit helpers ─────────────────────────────────────────────
function todayRec(habit, iso) {
    return habit.records?.find(r => r.day === iso) || null;
}
function habitDone(habit, iso) {
    const rec = todayRec(habit, iso);
    if (!rec) return false;
    const sgs = habit.sub_goals || [];
    return sgs.length > 0
        ? (rec.sub_goals_done?.length || 0) >= sgs.length
        : rec.done;
}
function sgsDone(habit, iso) {
    return todayRec(habit, iso)?.sub_goals_done || [];
}

// ── Progress ──────────────────────────────────────────────────
function recalcProgress() {
    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    let done = 0, total = 0;
    for (const h of pinned)   { total++; if (habitDone(h, viewDay)) done++; }
    for (const t of taskItems){ total++; if (t.done) done++; }
    const pct = total > 0 ? Math.round(done / total * 100) : 0;
    document.getElementById('todayProgressFill').style.width = pct + '%';
    document.getElementById('todayProgressLabel').textContent = `${done} / ${total} done`;
}

// ── Render ────────────────────────────────────────────────────
function render() {
    const isPast = viewDay < TODAY;

    // Header
    document.getElementById('todayDate').textContent = fmtDisplay(viewDay);
    document.getElementById('todayNextBtn').disabled = viewDay >= TODAY;

    recalcProgress();
    renderStatsPanel();

    const list = document.getElementById('todayList');
    list.innerHTML = '';

    // Past-day read banner
    if (isPast) {
        const banner = document.createElement('div');
        banner.className = 'today-past-banner';
        banner.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Viewing a past day — <strong>jump to today</strong>`;
        banner.addEventListener('click', () => switchDay(TODAY));
        list.appendChild(banner);
    }

    const pinned  = allHabits.filter(h => pinnedIds.includes(h.id));
    const carried = taskItems.filter(t => t.carriedFrom);
    const fresh   = taskItems.filter(t => !t.carriedFrom);

    // Carried-over (today only)
    if (!isPast && carried.length > 0) {
        list.appendChild(makeSectionLabel('↑ Carried over'));
        carried.forEach(t => list.appendChild(makeTaskRow(t, isPast)));
        list.appendChild(makeDivider());
    }

    // Pinned habits
    pinned.forEach(h => {
        list.appendChild(makeHabitRow(h, isPast));
        if (h._expanded && (h.sub_goals || []).length > 0) {
            list.appendChild(makeSgExpander(h, isPast));
        }
    });

    // One-off tasks
    fresh.forEach(t => list.appendChild(makeTaskRow(t, isPast)));

    // Add row (today only)
    if (!isPast) {
        list.appendChild(makeAddRow());
        list.appendChild(makePinSection());
    }

    applyIcons();
}

// ── Row builders ──────────────────────────────────────────────
function makeSectionLabel(text) {
    const el = document.createElement('div');
    el.className = 'today-section-label';
    el.textContent = text;
    return el;
}
function makeDivider() {
    const el = document.createElement('div');
    el.className = 'today-divider';
    return el;
}

function makeHabitRow(h, isPast) {
    const done = habitDone(h, viewDay);
    const sgs  = h.sub_goals || [];
    const doneCount = sgsDone(h, viewDay).length;

    const row = document.createElement('div');
    row.className = 'today-row';
    row.dataset.habitId = h.id;

    // Build icon element
    const iconSpan = document.createElement('span');
    iconSpan.className = 'today-row-icon';
    if (h.icon) iconSpan.appendChild(buildIconEl(h.icon, 15));

    row.innerHTML = `
        <span class="today-drag">⠿</span>
        <div class="today-check${done ? ' done' : ''}"></div>
        <span class="today-name${done ? ' done' : ''}">${escHtml(h.name)}</span>
        ${sgs.length > 0
            ? `<span class="today-badge habit">${doneCount}/${sgs.length}</span>`
            : `<span class="today-badge habit">habit</span>`}
    `;

    // Insert icon after the drag handle
    row.insertBefore(iconSpan, row.querySelector('.today-check'));

    if (!isPast) {
        if (sgs.length > 0) {
            row.addEventListener('click', e => {
                if (e.target.closest('.today-check')) return;
                h._expanded = !h._expanded;
                render();
            });
        } else {
            row.addEventListener('click', () => toggleHabit(h));
        }
    }
    return row;
}

function makeSgExpander(h, isPast) {
    const done = new Set(sgsDone(h, viewDay));
    const wrap = document.createElement('div');
    wrap.className = 'today-sg-row';

    (h.sub_goals || []).forEach(sg => {
        const pip = document.createElement('span');
        pip.className = 'today-sg-pip' + (done.has(sg.id) ? ' done' : '');
        pip.innerHTML = `<span>${done.has(sg.id) ? '✓' : '○'}</span> ${escHtml(sg.name)}`;
        if (!isPast) {
            pip.addEventListener('click', e => { e.stopPropagation(); toggleSg(h, sg.id); });
        } else {
            pip.style.cursor = 'default';
        }
        wrap.appendChild(pip);
    });

    return wrap;
}

function makeTaskRow(t, isPast) {
    const wrap = document.createElement('div');
    wrap.className = 'today-task-wrap';
    wrap.dataset.taskId = t.id;

    // Hidden delete button (revealed by swipe on mobile)
    const delBtn = document.createElement('div');
    delBtn.className = 'today-task-del';
    delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    wrap.appendChild(delBtn);

    const row = document.createElement('div');
    row.className = 'today-row today-task-inner';

    row.innerHTML = `
        <span class="today-drag">⠿</span>
        <div class="today-check${t.done ? ' done' : ''}"></div>
        <span class="today-name${t.done ? ' done' : ''}">${escHtml(t.text)}</span>
        ${t.carriedFrom ? `<span class="today-badge carryover">↑ yesterday</span>` : ''}
        ${!isPast ? `<button class="today-task-x" title="Delete task">✕</button>` : ''}
    `;

    if (!isPast) {
        row.addEventListener('click', e => {
            if (e.target.closest('.today-task-x')) return;
            toggleTask(t.id);
        });
        row.querySelector('.today-task-x')?.addEventListener('click', e => {
            e.stopPropagation();
            deleteTask(t.id, wrap);
        });
        // Mobile swipe (only on touch devices)
        if (window.matchMedia('(hover: none)').matches) {
            attachSwipe(wrap, row, delBtn, () => deleteTask(t.id, wrap));
        }
    } else {
        row.addEventListener('click', () => toggleTask(t.id));
    }

    wrap.appendChild(row);
    return wrap;
}

function makeAddRow() {
    const row = document.createElement('div');
    row.className = 'today-add-row';
    row.innerHTML = `<span class="today-add-plus">+</span><input class="today-add-input" placeholder="Add task for today…" type="text">`;
    const inp = row.querySelector('input');
    inp.addEventListener('keydown', async e => {
        if (e.key === 'Enter' && inp.value.trim()) {
            const text = inp.value.trim();
            inp.value = '';
            // Optimistic: push a temp task immediately (_pending prevents toggle until saved)
            const tempId = crypto.randomUUID();
            taskItems.push({ id: tempId, text, done: false, _pending: true });
            render();
            setTimeout(() => document.querySelector('.today-add-input')?.focus(), 0);
            _mutating++;
            try {
                const created = await api.post('/api/v1/tasks', { text, date: viewDay });
                // Replace temp with server-assigned task (real id, _pending cleared)
                const idx = taskItems.findIndex(t => t.id === tempId);
                if (idx !== -1) taskItems[idx] = created;
                render();
            } catch {
                taskItems = taskItems.filter(t => t.id !== tempId);
                render();
                toast('Failed to add task', 'error');
            } finally {
                _mutating--;
            }
        }
        if (e.key === 'Escape') inp.blur();
    });
    row.addEventListener('click', () => inp.focus());
    return row;
}

function makePinSection() {
    if (allHabits.length === 0) return document.createDocumentFragment();

    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-top:32px;';

    const label = document.createElement('div');
    label.className = 'today-section-label';
    label.style.margin = '0 0 8px 0';
    label.textContent = 'Pin habits to today';
    wrap.appendChild(label);

    allHabits.forEach(h => {
        const isPinned = pinnedIds.includes(h.id);
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:6px 6px;border-radius:8px;cursor:pointer;transition:background .12s;';
        row.addEventListener('mouseenter', () => row.style.background = 'var(--bg-elevated)');
        row.addEventListener('mouseleave', () => row.style.background = '');

        const box = document.createElement('div');
        box.style.cssText = `width:18px;height:18px;border-radius:4px;flex-shrink:0;transition:all .15s;display:flex;align-items:center;justify-content:center;border:1.5px solid ${isPinned ? 'var(--accent)' : 'var(--border)'};background:${isPinned ? 'var(--accent)' : 'transparent'};`;
        if (isPinned) box.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>`;

        const name = document.createElement('span');
        name.style.cssText = 'font-size:0.875rem;color:var(--text-primary);';
        name.textContent = h.name;

        row.appendChild(box);
        const pinIcon = document.createElement('span');
        pinIcon.className = 'today-row-icon';
        if (h.icon) pinIcon.appendChild(buildIconEl(h.icon, 15));
        row.appendChild(pinIcon);
        row.appendChild(name);
        row.addEventListener('click', () => {
            if (isPinned) pinnedIds = pinnedIds.filter(id => id !== h.id);
            else pinnedIds.push(h.id);
            savePinned();
            render();
        });

        wrap.appendChild(row);
    });

    return wrap;
}

// ── Actions ───────────────────────────────────────────────────
async function toggleHabit(h) {
    const isDone = habitDone(h, viewDay);
    try {
        const res = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay, date_fmt: '%Y-%m-%d', done: !isDone,
        });
        let rec = h.records.find(r => r.day === viewDay);
        if (!rec) { rec = { day: viewDay, done: false, count: 0, sub_goals_done: [] }; h.records.push(rec); }
        rec.done = res.done; rec.count = res.count;
        render();
    } catch {}
}

async function toggleSg(h, sgId) {
    try {
        const res = await api.post(`/api/v1/habits/${h.id}/completions`, {
            date: viewDay, date_fmt: '%Y-%m-%d', sub_goal_id: sgId,
        });
        let rec = h.records.find(r => r.day === viewDay);
        if (!rec) { rec = { day: viewDay, done: false, count: 0, sub_goals_done: [] }; h.records.push(rec); }
        rec.done = res.done; rec.count = res.count; rec.sub_goals_done = res.sub_goals_done;
        render();
    } catch {}
}

async function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (!t || t._pending) return; // skip tasks still being saved to server
    const prev = t.done;
    t.done = !prev;        // optimistic
    render();
    _mutating++;
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { done: t.done });
        t.done = updated.done; // confirm server value
        render();
    } catch (err) {
        t.done = prev;     // revert
        render();
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _mutating--;
    }
}

async function deleteTask(id, wrapEl) {
    const prev = [...taskItems];
    taskItems = taskItems.filter(t => t.id !== id); // optimistic
    wrapEl.style.transition = 'opacity .18s';
    wrapEl.style.opacity = '0';
    setTimeout(render, 200);
    _mutating++;
    try {
        await api.delete(`/api/v1/tasks/${id}`);
    } catch (err) {
        taskItems = prev;  // revert
        render();
        toast(err?.message || 'Failed to delete task', 'error');
    } finally {
        _mutating--;
    }
}

function attachSwipe(wrap, inner, delBtn, onDelete) {
    const OPEN_W = 60, SNAP_AT = 30;
    let startX = 0, offsetX = 0, isOpen = false, dragging = false;

    inner.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        offsetX = isOpen ? -OPEN_W : 0;
        dragging = false;
        inner.classList.remove('swipe-snap');
    }, { passive: true });

    inner.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        if (!dragging && Math.abs(dx) < 5) return;
        dragging = true;
        const next = Math.min(0, Math.max(-OPEN_W, offsetX + dx));
        inner.style.transform = `translateX(${next}px)`;
    }, { passive: true });

    inner.addEventListener('touchend', e => {
        if (!dragging) return;
        const dx = e.changedTouches[0].clientX - startX;
        inner.classList.add('swipe-snap');
        if (!isOpen && dx < -SNAP_AT) {
            inner.style.transform = `translateX(${-OPEN_W}px)`;
            isOpen = true;
        } else {
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    }, { passive: true });

    // Close on tap outside
    document.addEventListener('touchstart', e => {
        if (isOpen && !wrap.contains(e.target)) {
            inner.classList.add('swipe-snap');
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    }, { passive: true });

    delBtn.addEventListener('click', () => {
        inner.classList.add('swipe-snap');
        inner.style.transform = 'translateX(0)';
        isOpen = false;
        onDelete();
    });
}

// ── Silent refresh (cross-device sync) ───────────────────────
let _lastRefresh = 0;
let _mutating = 0; // incremented while a POST/PATCH/DELETE is in-flight
function silentRefresh() {
    const now = Date.now();
    if (now - _lastRefresh < 3000) return; // at most once per 3s
    _lastRefresh = now;
    (async () => {
        try {
            const fresh = await fetchTasks(viewDay, viewDay === TODAY);
            // Don't clobber optimistic state while a mutation is still in-flight
            if (_mutating > 0) return;
            // Only re-render if something actually changed
            if (JSON.stringify(fresh) !== JSON.stringify(taskItems)) {
                taskItems = fresh;
                render();
            }
        } catch { /* silently ignore — stale data is fine */ }
    })();
}

// ── Sortable ──────────────────────────────────────────────────
function initSortable() {
    const list = document.getElementById('todayList');
    if (!list || !window.Sortable) return;
    new Sortable(list, {
        handle: '.today-drag',
        animation: 150,
        ghostClass: 'today-ghost',
        filter: '.today-add-row, .today-past-banner',
    });
}

// ── Utils ─────────────────────────────────────────────────────
function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Stats panel ───────────────────────────────────────────────
function computeStreak(habit) {
    const doneSet = new Set(
        (habit.records || [])
            .filter(r => {
                if ((habit.sub_goals || []).length > 0) {
                    return (r.sub_goals_done?.length || 0) >= habit.sub_goals.length;
                }
                return r.done;
            })
            .map(r => r.day)
    );
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
        const iso = localIso(d);
        if (!doneSet.has(iso)) break;
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

function computeWeekBars(pinnedHabits) {
    // Returns array of 7 {iso, label, pct, isToday} objects covering the last 7 days ending on TODAY
    const bars = [];
    for (let i = 6; i >= 0; i--) {
        const iso = isoAddDays(TODAY, -i);
        const d = new Date(iso + 'T00:00:00');
        const label = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
        let done = 0;
        for (const h of pinnedHabits) {
            if (habitDone(h, iso)) done++;
        }
        const pct = pinnedHabits.length > 0 ? done / pinnedHabits.length : 0;
        bars.push({ iso, label, pct, isToday: iso === TODAY });
    }
    return bars;
}

function renderStatsPanel() {
    const panel = document.getElementById('todayStatsPanel');
    if (!panel) return;
    panel.innerHTML = '';

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    let habitsDone = 0, habitsTotal = 0, tasksDone = 0, tasksTotal = 0;
    for (const h of pinned) { habitsTotal++; if (habitDone(h, viewDay)) habitsDone++; }
    for (const t of taskItems) { tasksTotal++; if (t.done) tasksDone++; }
    const done = habitsDone + tasksDone;
    const total = habitsTotal + tasksTotal;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;

    // ── Progress cards ──
    const progSection = document.createElement('div');
    progSection.className = 'stats-panel-section';
    progSection.innerHTML = `
        <div class="stats-panel-label">Today's progress</div>
        <div class="stats-prog-cards">
            <div class="stats-prog-card">
                <div class="stats-prog-val">${done}</div>
                <div class="stats-prog-lbl">Done</div>
            </div>
            <div class="stats-prog-card">
                <div class="stats-prog-val">${total - done}</div>
                <div class="stats-prog-lbl">Left</div>
            </div>
            <div class="stats-prog-card">
                <div class="stats-prog-val">${pct}%</div>
                <div class="stats-prog-lbl">Complete</div>
            </div>
        </div>
    `;
    panel.appendChild(progSection);

    // ── Habit streaks ──
    if (pinned.length > 0) {
        const streakSection = document.createElement('div');
        streakSection.className = 'stats-panel-section';
        const label = document.createElement('div');
        label.className = 'stats-panel-label';
        label.textContent = 'Habit streaks';
        streakSection.appendChild(label);

        for (const h of pinned) {
            const streak = computeStreak(h);
            const row = document.createElement('div');
            row.className = 'stats-streak-row';

            const iconSpan = document.createElement('span');
            iconSpan.className = 'stats-streak-icon';
            if (h.icon) iconSpan.appendChild(buildIconEl(h.icon, 14));
            row.appendChild(iconSpan);

            const nameSpan = document.createElement('span');
            nameSpan.className = 'stats-streak-name';
            nameSpan.textContent = h.name;
            row.appendChild(nameSpan);

            const valSpan = document.createElement('span');
            valSpan.className = 'stats-streak-val';
            valSpan.textContent = streak > 0 ? '🔥 ' + streak : '— 0';
            row.appendChild(valSpan);

            streakSection.appendChild(row);
        }
        panel.appendChild(streakSection);
    }

    // ── Weekly chart ──
    const weekSection = document.createElement('div');
    weekSection.className = 'stats-panel-section';
    const weekLabel = document.createElement('div');
    weekLabel.className = 'stats-panel-label';
    weekLabel.textContent = 'This week';
    weekSection.appendChild(weekLabel);

    const bars = computeWeekBars(pinned);
    const maxPct = Math.max(...bars.map(b => b.pct), 0.01);

    const barsEl = document.createElement('div');
    barsEl.className = 'stats-week-bars';
    const labelsEl = document.createElement('div');
    labelsEl.className = 'stats-week-labels';

    for (const bar of bars) {
        const b = document.createElement('div');
        b.className = 'stats-week-bar' + (bar.isToday ? ' today-bar' : '');
        b.style.height = Math.max(bar.pct / maxPct * 100, bar.pct > 0 ? 8 : 3) + '%';
        b.title = Math.round(bar.pct * 100) + '%';
        barsEl.appendChild(b);

        const l = document.createElement('div');
        l.className = 'stats-week-lbl' + (bar.isToday ? ' today-lbl' : '');
        l.textContent = bar.label;
        labelsEl.appendChild(l);
    }

    weekSection.appendChild(barsEl);
    weekSection.appendChild(labelsEl);
    panel.appendChild(weekSection);

    applyIcons();
}

// ── Init ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    pinnedIds = loadPinned();

    // Migrate any tasks that existed only in localStorage (pre-server-sync era)
    await migrateLocalTasks();

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
