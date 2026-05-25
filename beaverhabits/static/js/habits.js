// beaverhabits/static/js/habits.js
import { api, toast } from '/static/js/api.js';
import { mountCalendar, renderDailyChart } from '/static/js/monthly.js';
import { openNoteEditor } from '/static/js/notes.js';

// ── State ─────────────────────────────────────────────────────
let allHabits = [];
let activeDay = null;       // ISO string 'YYYY-MM-DD' — null = today
let selectedHabitId = null;
let searchTerm = '';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Utils ─────────────────────────────────────────────────────
function isoToday() {
    const d = new Date(); d.setHours(0,0,0,0);
    return d.toISOString().slice(0, 10);
}
function isoNDaysAgo(n) {
    const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
}
function recordForDay(records, iso) {
    return records?.find(r => r.day === iso) || null;
}
function getActiveIso() { return activeDay || isoToday(); }

// ── Week strip ────────────────────────────────────────────────
function renderWeekStrip() {
    const container = document.getElementById('weekDays');
    if (!container) return;
    container.innerHTML = '';
    const todayIso = isoToday();
    const activeIso = getActiveIso();

    for (let i = 6; i >= 0; i--) {
        const iso = isoNDaysAgo(i);
        const d = new Date(iso + 'T00:00:00');
        const col = document.createElement('div');
        col.className = 'week-day' + (iso === todayIso ? ' today' : '') + (iso === activeIso ? ' active' : '');
        col.dataset.iso = iso;

        const label = document.createElement('div');
        label.className = 'wd-label';
        label.textContent = DAY_NAMES[d.getDay()];

        const num = document.createElement('div');
        num.className = 'wd-num';
        num.textContent = d.getDate();

        const dot = document.createElement('div');
        dot.className = 'wd-dot';
        // Dot: count habits done on this day
        const done = allHabits.filter(h => {
            const rec = recordForDay(h.records, iso);
            return rec && (rec.done || rec.count >= h.target_count);
        }).length;
        if (done > 0 && done < allHabits.length) dot.classList.add('partial');
        else if (done === allHabits.length && allHabits.length > 0) dot.classList.add('full');

        col.append(label, num, dot);
        col.addEventListener('click', () => {
            activeDay = iso === todayIso ? null : iso;
            renderWeekStrip();
            renderHabitList();
            updateActiveDayChip();
        });
        container.appendChild(col);
    }
}

function updateActiveDayChip() {
    const chip = document.getElementById('activeDayChip');
    const label = document.getElementById('activeDayLabel');
    if (!chip || !label) return;
    if (activeDay) {
        const d = new Date(activeDay + 'T00:00:00');
        label.textContent = `📌 ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
        chip.style.display = 'flex';
    } else {
        chip.style.display = 'none';
    }
}

// ── Habit list rendering ──────────────────────────────────────
function groupByFirstTag(habits) {
    const groups = new Map(); // tag → [habit]
    for (const h of habits) {
        const tag = h.tags?.[0] || 'Others';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(h);
    }
    // "Others" always last
    const sorted = [...groups.entries()].sort(([a], [b]) => {
        if (a === 'Others') return 1;
        if (b === 'Others') return -1;
        return a.localeCompare(b);
    });
    return sorted;
}

function renderHabitList() {
    const container = document.getElementById('habitList');
    if (!container) return;
    container.innerHTML = '';
    const activeIso = getActiveIso();

    const filtered = searchTerm
        ? allHabits.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase()))
        : allHabits;

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:24px 16px;text-align:center;color:var(--text-muted);font-size:13px">No habits yet. Click + to add one.</div>';
        return;
    }

    const groups = groupByFirstTag(filtered);
    const collapsedGroups = new Set(JSON.parse(sessionStorage.getItem('collapsedGroups') || '[]'));

    for (const [tag, habits] of groups) {
        // Group header
        const header = document.createElement('div');
        header.className = 'group-header' + (collapsedGroups.has(tag) ? ' collapsed' : '');
        header.innerHTML = `<span class="gh-arrow">▼</span><span>${tag}</span><span class="gh-count">${habits.length}</span>`;
        header.addEventListener('click', () => {
            if (collapsedGroups.has(tag)) collapsedGroups.delete(tag);
            else collapsedGroups.add(tag);
            sessionStorage.setItem('collapsedGroups', JSON.stringify([...collapsedGroups]));
            renderHabitList();
        });
        container.appendChild(header);

        if (collapsedGroups.has(tag)) continue;

        for (const h of habits) {
            const row = h.sub_goals?.length > 0
                ? buildSubgoalRow(h, activeIso)
                : buildRegularRow(h, activeIso);
            container.appendChild(row);
        }
    }
}

// ── Regular habit row ─────────────────────────────────────────
function buildRegularRow(h, activeIso) {
    const rec = recordForDay(h.records, activeIso);
    const isDone = rec && (rec.done || rec.count >= h.target_count);

    const row = document.createElement('div');
    row.className = 'hrow' + (h.id === selectedHabitId ? ' selected' : '');
    row.dataset.habitId = h.id;

    const icon = document.createElement('div');
    icon.className = 'hrow-icon';
    icon.textContent = h.icon || '📌';

    const body = document.createElement('div');
    body.className = 'hrow-body';

    const name = document.createElement('div');
    name.className = 'hrow-name' + (isDone ? ' done' : '');
    name.textContent = h.name;

    const meta = document.createElement('div');
    meta.className = 'hrow-meta';
    // Streak badge
    const streakText = `🔥 ${h._streak ?? '—'}`;
    const daysText = `💧 ${h._total ?? '—'} days`;
    meta.innerHTML = `<span>${daysText}</span><span>${streakText}</span>`;

    body.append(name, meta);

    const toggle = document.createElement('button');
    toggle.className = 'hrow-toggle' + (isDone ? ' done' : '');
    toggle.title = isDone ? 'Mark undone' : 'Mark done';
    toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newCount = isDone ? 0 : h.target_count;
        const prevClass = toggle.className;
        toggle.className = 'hrow-toggle' + (newCount >= h.target_count ? ' done' : '');
        try {
            await api.post(`/api/v1/habits/${h.id}/completions`, {
                count: newCount, date: activeIso, date_fmt: '%Y-%m-%d',
            });
            await refreshHabits();
        } catch (err) {
            toggle.className = prevClass;
            toast(err.message, 'error');
        }
    });

    row.append(icon, body, toggle);
    row.addEventListener('click', () => selectHabit(h.id));
    return row;
}

// ── Sub-goal habit row ────────────────────────────────────────
function buildSubgoalRow(h, activeIso) {
    const rec = recordForDay(h.records, activeIso);
    const doneDoneIds = new Set(rec?.sub_goals_done || []);
    const total = h.sub_goals.length;
    const doneCount = doneDoneIds.size;
    const pct = total > 0 ? doneCount / total : 0;

    const row = document.createElement('div');
    row.className = 'hrow' + (h.id === selectedHabitId ? ' selected' : '');
    row.dataset.habitId = h.id;

    // Progress ring SVG
    const R = 12; const CX = 15; const CY = 15;
    const circumference = 2 * Math.PI * R;
    const dash = pct * circumference;
    const icon = document.createElement('div');
    icon.className = 'hrow-icon';
    icon.style.background = 'none';
    icon.style.border = 'none';
    icon.innerHTML = `<svg class="progress-ring" viewBox="0 0 30 30">
        <circle class="track" cx="${CX}" cy="${CY}" r="${R}"/>
        <circle class="fill" cx="${CX}" cy="${CY}" r="${R}"
            stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}"
            stroke-dashoffset="${(circumference / 4).toFixed(2)}"
            transform="rotate(-90 ${CX} ${CY})"/>
    </svg>`;

    const body = document.createElement('div');
    body.className = 'hrow-body';

    const name = document.createElement('div');
    name.className = 'hrow-name';
    name.textContent = h.name;

    const meta = document.createElement('div');
    meta.className = 'hrow-meta';
    const unit = h.sub_goal_unit || 'items';
    meta.innerHTML = `<span>💧 ${h._total ?? '—'} days</span><span>${doneCount}/${total} ${unit}</span>`;

    const pills = document.createElement('div');
    pills.className = 'subgoal-pills';
    for (const sg of h.sub_goals) {
        const pill = document.createElement('div');
        pill.className = 'sg-pill' + (doneDoneIds.has(sg.id) ? ' done' : '');
        pill.textContent = sg.name;
        pill.addEventListener('click', async (e) => {
            e.stopPropagation();
            const prevClass = pill.className;
            pill.classList.toggle('done');
            try {
                await api.post(`/api/v1/habits/${h.id}/completions`, {
                    date: activeIso, date_fmt: '%Y-%m-%d', sub_goal_id: sg.id,
                });
                await refreshHabits();
            } catch (err) {
                pill.className = prevClass;
                toast(err.message, 'error');
            }
        });
        pills.appendChild(pill);
    }

    body.append(name, meta, pills);
    row.append(icon, body);
    row.addEventListener('click', (e) => {
        if (e.target.closest('.sg-pill')) return;
        selectHabit(h.id);
    });
    return row;
}

// ── Detail panel ──────────────────────────────────────────────
async function selectHabit(id) {
    selectedHabitId = id;
    renderHabitList(); // re-render to show selection

    document.getElementById('detailEmpty').style.display = 'none';
    const content = document.getElementById('detailContent');
    content.style.display = 'flex';

    // Mobile: slide detail panel in
    document.getElementById('detailPanel')?.classList.add('open');

    const h = allHabits.find(x => x.id === id);
    if (!h) return;

    document.getElementById('detailIcon').textContent = h.icon || '📌';
    document.getElementById('detailTitle').textContent = h.name;

    // Load stats
    try {
        const stats = await api.get(`/api/v1/habits/${id}/stats`);
        document.getElementById('statMonthlyCheckins').textContent  = stats.monthly_checkins;
        document.getElementById('statTotalCheckins').textContent    = stats.total;
        document.getElementById('statMonthlyRate').textContent      = `${stats.monthly_checkin_rate}%`;
        document.getElementById('statStreak').textContent           = stats.streak;
        document.getElementById('statMonthlyCompletion').textContent = stats.monthly_completion;
        document.getElementById('statTotalCompletion').textContent  = stats.total_completion;
    } catch { /* leave stale */ }

    // Mount calendar
    mountCalendar(h.id, h.sub_goals || [], h.target_count, h.records || []);

    // Render line chart
    renderDailyChart(h.target_count, h.records || []);
}

window.closeDetail = function() {
    document.getElementById('detailPanel')?.classList.remove('open');
};

// ── Detail "···" menu ─────────────────────────────────────────
function wireDetailMore() {
    const btn = document.getElementById('detailMore');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const h = allHabits.find(x => x.id === selectedHabitId);
        if (h) openHabitModal(h);
    });
}

// ── Add / refresh ─────────────────────────────────────────────
export async function refreshHabits() {
    const raw = await api.get('/api/v1/habits');
    // Enrich with streak/total from stats (batch async)
    allHabits = await Promise.all(raw.map(async h => {
        try {
            const s = await api.get(`/api/v1/habits/${h.id}/stats`);
            h._streak = s.streak;
            h._total = s.total;
        } catch { h._streak = 0; h._total = 0; }
        return h;
    }));
    renderWeekStrip();
    renderHabitList();
    updateActiveDayChip();
}

// ── Initialise ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('habitList')) return;

    refreshHabits();
    wireDetailMore();

    document.getElementById('addBtn')?.addEventListener('click', () => openHabitModal(null));
    document.getElementById('activeDayClear')?.addEventListener('click', () => {
        activeDay = null;
        renderWeekStrip();
        renderHabitList();
        updateActiveDayChip();
    });

    // Close popup on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('sgPopup').style.display = 'none';
            window.closeSgSheet?.();
        }
    });
});
