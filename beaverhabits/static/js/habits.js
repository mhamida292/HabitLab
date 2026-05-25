// beaverhabits/static/js/habits.js
import { api, toast } from '/static/js/api.js';
import { mountCalendar, updateCalendarRecord } from '/static/js/monthly.js';
import { openNoteEditor } from '/static/js/notes.js';
import { buildIconEl, applyIcons } from '/static/js/icons.js';

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
    // Hydrate any <i data-lucide="..."> icons injected above
    applyIcons();
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
    icon.style.color = 'var(--text-secondary)';
    icon.appendChild(buildIconEl(h.icon || 'map-pin', 18));

    const body = document.createElement('div');
    body.className = 'hrow-body';

    const name = document.createElement('div');
    name.className = 'hrow-name' + (isDone ? ' done' : '');
    name.textContent = h.name;

    const meta = document.createElement('div');
    meta.className = 'hrow-meta';
    const si = `<i data-lucide="droplet" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px"></i>`;
    const fi = `<i data-lucide="flame" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px;color:var(--streak)"></i>`;
    meta.innerHTML = `<span>${si}${h._total ?? '—'} days</span><span>${fi}${h._streak ?? '—'}</span>`;

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
            const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
                count: newCount, date: activeIso, date_fmt: '%Y-%m-%d',
            });
            // Update local state, avoid full N+1 refresh
            const habit = allHabits.find(x => x.id === h.id);
            if (habit) {
                let rec = habit.records?.find(r => r.day === activeIso);
                if (!rec) {
                    rec = { day: activeIso, count: 0, done: false, sub_goals_done: [] };
                    (habit.records = habit.records || []).push(rec);
                }
                rec.count = result.count;
                rec.done = result.done;
                // Keep calendar + stats in sync if this is the selected habit
                if (h.id === selectedHabitId) {
                    updateCalendarRecord(activeIso, rec);
                    refreshDetailStats(h.id);
                }
            }
            renderHabitList();
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
                const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
                    date: activeIso, date_fmt: '%Y-%m-%d', sub_goal_id: sg.id,
                });
                // Update local record, re-render list only (no N+1 refresh)
                const habit = allHabits.find(x => x.id === h.id);
                if (habit) {
                    let rec = habit.records?.find(r => r.day === activeIso);
                    if (!rec) {
                        rec = { day: activeIso, count: 0, done: false, sub_goals_done: [] };
                        (habit.records = habit.records || []).push(rec);
                    }
                    rec.sub_goals_done = result.sub_goals_done;
                    rec.count = result.count;
                    rec.done = result.done;
                    if (h.id === selectedHabitId) {
                        updateCalendarRecord(activeIso, rec);
                        refreshDetailStats(h.id);
                    }
                }
                renderHabitList();
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

async function onSgCheckClick(habitId, sgId, dateIso) {
    try {
        const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
            date: dateIso, date_fmt: '%Y-%m-%d', sub_goal_id: sgId,
        });
        const habit = allHabits.find(h => h.id === habitId);
        if (habit) {
            let rec = habit.records?.find(r => r.day === dateIso);
            if (!rec) {
                rec = { day: dateIso, count: 0, done: false, sub_goals_done: [] };
                (habit.records = habit.records || []).push(rec);
            }
            rec.sub_goals_done = result.sub_goals_done;
            rec.count = result.count;
            rec.done = result.done;
            renderSubGoalsSection(habit);
            const rec2 = (habit.records || []).find(r => r.day === dateIso);
            updateCalendarRecord(dateIso, rec2);
            refreshDetailStats(habitId);
        }
    } catch (e) {
        console.error('Failed to toggle sub-goal', e);
    }
}

async function renderRecentNotes(habitId) {
    const list = document.getElementById('detailNotesList');
    const addBtn = document.getElementById('detailNotesAdd');
    if (!list || !addBtn) return;

    list.innerHTML = '';

    try {
        const notes = await api.get(`/api/v1/notes?habit_id=${habitId}`);
        const recent = notes.slice(0, 2); // already newest-first from API

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
    } catch (e) {
        // silently fail — notes are non-critical
    }

    addBtn.onclick = () => {
        location.href = `/notes?new=1&habit_id=${habitId}`;
    };
}

// ── Refresh detail stat cards (called after each toggle) ──────
async function refreshDetailStats(id) {
    if (id !== selectedHabitId) return;
    try {
        const stats = await api.get(`/api/v1/habits/${id}/stats`);
        document.getElementById('statMonthlyCheckins').textContent  = stats.monthly_checkins;
        document.getElementById('statTotalCheckins').textContent    = stats.total;
        document.getElementById('statMonthlyRate').textContent      = `${stats.all_time_rate}%`;
        document.getElementById('statStreak').textContent           = stats.streak;
    } catch { /* leave stale */ }
}

// ── Detail panel ──────────────────────────────────────────────
async function selectHabit(id) {
    selectedHabitId = id;
    renderHabitList(); // re-render to show selection

    document.getElementById('detailEmpty').style.display = 'none';
    document.getElementById('detailContent').style.display = 'block';

    // Mobile: slide detail panel in
    document.getElementById('detailPanel')?.classList.add('open');

    const h = allHabits.find(x => x.id === id);
    if (!h) return;

    const detailIcon = document.getElementById('detailIcon');
    detailIcon.innerHTML = '';
    detailIcon.style.color = 'var(--text-secondary)';
    detailIcon.appendChild(buildIconEl(h.icon || 'map-pin', 22));
    applyIcons();
    document.getElementById('detailTitle').textContent = h.name;

    // Load stats
    try {
        const stats = await api.get(`/api/v1/habits/${id}/stats`);
        document.getElementById('statMonthlyCheckins').textContent  = stats.monthly_checkins;
        document.getElementById('statTotalCheckins').textContent    = stats.total;
        document.getElementById('statMonthlyRate').textContent      = `${stats.all_time_rate}%`;
        document.getElementById('statStreak').textContent           = stats.streak;
    } catch { /* leave stale */ }

    // Mount calendar — refresh stats + sub-goals section on any date toggle
    mountCalendar(h.id, h.sub_goals || [], h.target_count, h.records || [], () => {
        refreshDetailStats(h.id);
        renderSubGoalsSection(h);
    });

    // Render right column
    renderTrendChart(h.records || []);
    renderSubGoalsSection(h);
    renderRecentNotes(h.id);
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

// Expose for app.js (avoids cross-module-instance issue with dynamic import)
window._refreshHabits = refreshHabits;

// ── Calendar toggle → instant stat refresh ────────────────────
// monthly.js dispatches 'cal:toggled' after every successful date click.
// We handle it here to keep stats snappy without waiting for a server round-trip.
document.addEventListener('cal:toggled', ({ detail: { habitId, iso, newRec, prevDone } }) => {
    // Update in-memory record so the habit list row re-renders correctly
    const habit = allHabits.find(h => h.id === habitId);
    if (habit) {
        let rec = habit.records?.find(r => r.day === iso);
        if (!rec) {
            rec = { day: iso, count: 0, done: false, sub_goals_done: [] };
            (habit.records = habit.records || []).push(rec);
        }
        rec.count = newRec.count;
        rec.done  = newRec.done;
        rec.sub_goals_done = newRec.sub_goals_done || [];
        // Re-render the list so today's row dot/check updates immediately
        renderHabitList();
    }

    // Only update detail panel if this is the selected habit
    if (habitId !== selectedHabitId) return;

    // Optimistic stat update — adjust monthly count right now, no round-trip
    const currentMonth = new Date().toISOString().slice(0, 7);
    if (iso.slice(0, 7) === currentMonth) {
        const el = document.getElementById('statMonthlyCheckins');
        if (el) {
            const delta = newRec.done && !prevDone ? 1 : !newRec.done && prevDone ? -1 : 0;
            if (delta !== 0) el.textContent = Math.max(0, (parseInt(el.textContent) || 0) + delta);
        }
    }

    // Accurate async refresh for streak, rate, totals
    refreshDetailStats(habitId);
    // Re-render sub-goals if the toggled date is today
    if (habit && iso === new Date().toISOString().slice(0, 10)) {
        renderSubGoalsSection(habit);
    }
});

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
