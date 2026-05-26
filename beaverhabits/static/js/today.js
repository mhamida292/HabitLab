// beaverhabits/static/js/today.js — Daily task list
import { api } from '/static/js/api.js';
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

// ── Switch viewing day ────────────────────────────────────────
function switchDay(iso) {
    viewDay   = iso;
    taskItems = loadTasks(iso);
    if (iso === TODAY) collectCarriedOver();
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
    const row = document.createElement('div');
    row.className = 'today-row';
    row.dataset.taskId = t.id;

    row.innerHTML = `
        <span class="today-drag">⠿</span>
        <div class="today-check${t.done ? ' done' : ''}"></div>
        <span class="today-name${t.done ? ' done' : ''}">${escHtml(t.text)}</span>
        ${t.carriedFrom ? `<span class="today-badge carryover">↑ yesterday</span>` : ''}
    `;

    if (!isPast) row.addEventListener('click', () => toggleTask(t.id));
    return row;
}

function makeAddRow() {
    const row = document.createElement('div');
    row.className = 'today-add-row';
    row.innerHTML = `<span class="today-add-plus">+</span><input class="today-add-input" placeholder="Add task for today…" type="text">`;
    const inp = row.querySelector('input');
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

function toggleTask(id) {
    const t = taskItems.find(x => x.id === id);
    if (t) { t.done = !t.done; saveTasks(); render(); }
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

// ── Init ──────────────────────────────────────────────────────
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
