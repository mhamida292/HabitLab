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
// Local ISO date — avoids UTC mismatch on users ahead of UTC (e.g. UTC+1 late night)
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoToday() { return localIso(); }
function isoNDaysAgo(n) {
    const d = new Date(); d.setDate(d.getDate() - n);
    return localIso(d);
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

// ── Habit order persistence ───────────────────────────────────
async function saveHabitOrder() {
    const ids = [...document.querySelectorAll('.hrow[data-habit-id]')]
        .map(el => el.dataset.habitId);
    try {
        await api.put('/api/v1/habits/meta', { order: ids });
    } catch (e) {
        toast('Could not save order', 'error');
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

        // Sortable group wrapper — drag only within this category
        const groupEl = document.createElement('div');
        groupEl.className = 'habit-group';
        groupEl.dataset.tag = tag;

        for (const h of habits) {
            const row = h.sub_goals?.length > 0
                ? buildSubgoalRow(h, activeIso)
                : buildRegularRow(h, activeIso);
            groupEl.appendChild(row);
        }
        container.appendChild(groupEl);

        if (window.Sortable) {
            new Sortable(groupEl, {
                animation: 150,
                handle: '.hrow-drag-handle',
                ghostClass: 'hrow-ghost',
                onEnd: saveHabitOrder,
            });
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
    const si = `<i data-lucide="check-circle-2" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px"></i>`;
    const fi = `<i data-lucide="flame" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px;color:var(--streak)"></i>`;
    meta.innerHTML = `<span>${si}${h._total ?? '—'} days</span><span>${fi}${h._streak ?? '—'}</span>`;

    body.append(name, meta);

    const toggle = document.createElement('button');
    toggle.className = 'hrow-toggle' + (isDone ? ' done' : '');
    toggle.title = isDone ? 'Mark undone' : 'Mark done';
    toggle.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newCount = isDone ? 0 : h.target_count;
        try {
            const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
                count: newCount, date: activeIso, date_fmt: '%Y-%m-%d',
            });
            // Patch local state with server response, then re-render
            const habit = allHabits.find(x => x.id === h.id);
            if (habit) {
                let rec = habit.records?.find(r => r.day === activeIso);
                if (!rec) {
                    rec = { day: activeIso, count: 0, done: false, sub_goals_done: [] };
                    (habit.records = habit.records || []).push(rec);
                }
                rec.count = result.count;
                rec.done = result.done;
                if (h.id === selectedHabitId) {
                    updateCalendarRecord(activeIso, rec);
                    refreshDetailStats(h.id);
                }
            }
            renderHabitList();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    const handle = document.createElement('div');
    handle.className = 'hrow-drag-handle';
    handle.innerHTML = '⠿';

    row.append(handle, icon, body, toggle);
    row.addEventListener('click', () => selectHabit(h.id));
    row.addEventListener('contextmenu', e => showCtxMenu(e, h));

    // Mobile swipe wrap
    if (window.matchMedia('(hover: none)').matches) {
        const wrap = document.createElement('div');
        wrap.className = 'hrow-wrap';
        row.classList.add('hrow-swipe-inner');

        const swipeBtns = document.createElement('div');
        swipeBtns.className = 'hrow-swipe-btns';

        const archBtn = document.createElement('div');
        archBtn.className = 'hrow-swipe-btn archive';
        archBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;

        const delBtn = document.createElement('div');
        delBtn.className = 'hrow-swipe-btn delete';
        delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

        swipeBtns.append(archBtn, delBtn);
        wrap.append(swipeBtns, row);
        attachHabitSwipe(wrap, row, archBtn, delBtn, h);
        return wrap;
    }

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
    meta.innerHTML = `<span><i data-lucide="check-circle-2" style="width:11px;height:11px;display:inline-block;vertical-align:middle;margin-right:2px"></i>${h._total ?? '—'} days</span><span>${doneCount}/${total} ${unit}</span>`;

    const pills = document.createElement('div');
    pills.className = 'subgoal-pills';
    for (const sg of h.sub_goals) {
        const pill = document.createElement('div');
        pill.className = 'sg-pill' + (doneDoneIds.has(sg.id) ? ' done' : '');
        pill.textContent = sg.name;
        pill.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                const result = await api.post(`/api/v1/habits/${h.id}/completions`, {
                    date: activeIso, date_fmt: '%Y-%m-%d', sub_goal_id: sg.id,
                });
                // Patch local state with server response, then re-render
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
                        renderSubGoalsSection(habit);
                    }
                }
                renderHabitList();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
        pills.appendChild(pill);
    }

    body.append(name, meta, pills);

    const handle = document.createElement('div');
    handle.className = 'hrow-drag-handle';
    handle.innerHTML = '⠿';

    row.append(handle, icon, body);
    row.addEventListener('click', (e) => {
        if (e.target.closest('.sg-pill')) return;
        selectHabit(h.id);
    });
    row.addEventListener('contextmenu', e => showCtxMenu(e, h));

    // Mobile swipe wrap
    if (window.matchMedia('(hover: none)').matches) {
        const wrap = document.createElement('div');
        wrap.className = 'hrow-wrap';
        row.classList.add('hrow-swipe-inner');

        const swipeBtns = document.createElement('div');
        swipeBtns.className = 'hrow-swipe-btns';

        const archBtn = document.createElement('div');
        archBtn.className = 'hrow-swipe-btn archive';
        archBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;

        const delBtn = document.createElement('div');
        delBtn.className = 'hrow-swipe-btn delete';
        delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

        swipeBtns.append(archBtn, delBtn);
        wrap.append(swipeBtns, row);
        attachHabitSwipe(wrap, row, archBtn, delBtn, h);
        return wrap;
    }

    return row;
}

// ── Mobile swipe: archive / delete ────────────────────────────
function attachHabitSwipe(wrap, inner, archBtn, delBtn, habit) {
    const OPEN_W = 120, SNAP_AT = 48;
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

    document.addEventListener('touchstart', e => {
        if (isOpen && !wrap.contains(e.target)) {
            inner.classList.add('swipe-snap');
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    }, { passive: true });

    function closeSwipe() {
        inner.classList.add('swipe-snap');
        inner.style.transform = 'translateX(0)';
        isOpen = false;
    }

    archBtn.addEventListener('click', async () => {
        closeSwipe();
        try {
            await api.put(`/api/v1/habits/${habit.id}`, { status: 'archive' });
            allHabits = allHabits.filter(h => h.id !== habit.id);
            renderHabitList();
            toast('Habit archived');
        } catch (err) {
            toast(err.message || 'Failed to archive', 'error');
        }
    });

    delBtn.addEventListener('click', () => {
        closeSwipe();
        // Show inline confirmation banner below the row
        const confirm = document.createElement('div');
        confirm.className = 'hrow-delete-confirm';
        confirm.innerHTML = `
            <span style="flex:1">Delete "${escapeHtml(habit.name)}" permanently?</span>
            <button class="hrow-confirm-yes">Delete</button>
            <button class="hrow-confirm-no">Cancel</button>
        `;
        wrap.appendChild(confirm);

        confirm.querySelector('.hrow-confirm-yes').addEventListener('click', async () => {
            try {
                await api.delete(`/api/v1/habits/${habit.id}`);
                allHabits = allHabits.filter(h => h.id !== habit.id);
                renderHabitList();
                toast('Habit deleted');
            } catch (err) {
                toast(err.message || 'Failed to delete', 'error');
                confirm.remove();
            }
        });
        confirm.querySelector('.hrow-confirm-no').addEventListener('click', () => confirm.remove());
    });
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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
            const iso = localIso(cursor);
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

    const today = localIso();
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
        location.href = `/notes?new=1&habit_id=${habitId}&date=${getActiveIso()}`;
    };
}

// ── Refresh detail stat cards (called after each toggle) ──────
async function refreshDetailStats(id) {
    if (id !== selectedHabitId) return;
    try {
        const stats = await api.get(`/api/v1/habits/${id}/stats?today=${localIso()}`);
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
        const stats = await api.get(`/api/v1/habits/${id}/stats?today=${localIso()}`);
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
    const todayParam = localIso();
    allHabits = await Promise.all(raw.map(async h => {
        try {
            const s = await api.get(`/api/v1/habits/${h.id}/stats?today=${todayParam}`);
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
    const currentMonth = localIso().slice(0, 7);
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
    if (habit && iso === localIso()) {
        renderSubGoalsSection(habit);
    }
});

// ── Right-click context menu (desktop) ────────────────────────
let _ctxHabit = null;

function initContextMenu() {
    // Only attach on pointer (non-touch) devices
    if (!window.matchMedia('(hover: hover)').matches) return;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'habitCtxMenu';
    menu.innerHTML = `
        <div class="ctx-menu-item" id="ctxEdit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit habit
        </div>
        <div class="ctx-menu-item warn" id="ctxArchive">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            Archive
        </div>
        <div class="ctx-menu-sep"></div>
        <div class="ctx-menu-item danger" id="ctxDelete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Delete…
        </div>
    `;
    document.body.appendChild(menu);

    // Dismiss on outside click or Escape
    document.addEventListener('mousedown', e => {
        if (!menu.contains(e.target)) hideCtxMenu();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') hideCtxMenu();
    });

    // Edit action — opens the habit edit modal (same as "···" button in detail panel)
    menu.querySelector('#ctxEdit').addEventListener('click', () => {
        const habit = _ctxHabit;
        hideCtxMenu();
        if (habit) openHabitModal(habit);
    });

    // Archive action
    menu.querySelector('#ctxArchive').addEventListener('click', async () => {
        const habit = _ctxHabit;
        hideCtxMenu();
        if (!habit) return;
        try {
            await api.put(`/api/v1/habits/${habit.id}`, { status: 'archive' });
            allHabits = allHabits.filter(h => h.id !== habit.id);
            renderHabitList();
            toast('Habit archived');
        } catch (err) {
            toast(err.message || 'Failed to archive', 'error');
        }
    });

    // Delete action
    menu.querySelector('#ctxDelete').addEventListener('click', () => {
        const habit = _ctxHabit;
        hideCtxMenu();
        if (!habit) return;
        const confirmed = window.confirm(`Delete "${habit.name}" permanently? This cannot be undone.`);
        if (!confirmed) return;
        api.delete(`/api/v1/habits/${habit.id}`)
            .then(() => {
                allHabits = allHabits.filter(h => h.id !== habit.id);
                renderHabitList();
                toast('Habit deleted');
            })
            .catch(err => toast(err.message || 'Failed to delete', 'error'));
    });
}

function showCtxMenu(e, habit) {
    e.preventDefault();
    _ctxHabit = habit;
    const menu = document.getElementById('habitCtxMenu');
    if (!menu) return;
    // Position at cursor, keeping within viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 170, mh = 130;
    let x = e.clientX, y = e.clientY;
    if (x + mw > vw) x = vw - mw - 8;
    if (y + mh > vh) y = vh - mh - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.classList.add('open');
}

function hideCtxMenu() {
    document.getElementById('habitCtxMenu')?.classList.remove('open');
    _ctxHabit = null;
}

// ── Initialise ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('habitList')) return;

    refreshHabits();
    wireDetailMore();
    initContextMenu();

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
