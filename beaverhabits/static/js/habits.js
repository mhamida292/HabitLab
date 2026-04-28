import { api, toast } from '/static/js/api.js';
import { openNoteEditor } from '/static/js/notes.js';

const ICON_PALETTE = [
    '📌','💧','📚','🏃','🧘','🙏','💪','🌅',
    '🍎','💤','✍️','🎵','🎨','🌱','💊','🚶',
    '🧠','❤️','🚴','🛌','📖','🥗','🧹','📞',
];

let allHabits = [];
let activeFilter = 'all';
let activeTag = null;
let searchTerm = '';
let sortMode = 'manual';
let editingHabitId = null;

function dateNDaysAgo(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

function recordFor(records, isoDay) {
    return records?.find(r => r.day === isoDay) || null;
}

function paintCheckbox(chk, count, target) {
    const done = count >= target;
    chk.dataset.count = count;
    chk.dataset.done = done ? '1' : '0';
    if (done) {
        chk.dataset.status = 'yes';
        chk.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (count > 0) {
        chk.dataset.status = '';
        chk.innerHTML = `<span class="hchk-count">${count}/${target}</span>`;
    } else {
        chk.dataset.status = '';
        chk.innerHTML = '';
    }
}

function attachCheckHandlers(chk, habit, getRecords, target) {
    let pressTimer = null;
    let longPressed = false;

    const startPress = () => {
        longPressed = false;
        pressTimer = setTimeout(() => {
            longPressed = true;
            // Long press: if target > 1, reset count to 0; else open note editor.
            if (target > 1) {
                resetDay(chk, habit);
            } else {
                const records = getRecords();
                const existing = recordFor(records, chk.dataset.date);
                openNoteEditor({
                    habitId: habit.id,
                    date: chk.dataset.date,
                    existing,
                    onSave: refreshHabits,
                });
            }
        }, 500);
    };
    const endPress = () => clearTimeout(pressTimer);

    chk.addEventListener('mousedown', startPress);
    chk.addEventListener('touchstart', startPress, { passive: true });
    chk.addEventListener('mouseup', endPress);
    chk.addEventListener('touchend', endPress);
    chk.addEventListener('mouseleave', endPress);

    chk.addEventListener('click', async () => {
        if (longPressed) return;
        const cur = parseInt(chk.dataset.count || '0', 10);
        let nextCount;
        if (target === 1) {
            nextCount = cur >= 1 ? 0 : 1;
        } else {
            nextCount = cur >= target ? 0 : cur + 1;
        }
        const prev = cur;
        paintCheckbox(chk, nextCount, target);
        try {
            await api.post(`/api/v1/habits/${habit.id}/completions`, {
                count: nextCount,
                date: chk.dataset.date,
                date_fmt: '%Y-%m-%d',
            });
        } catch (err) {
            paintCheckbox(chk, prev, target);
            toast(err.message, 'error');
        }
    });
}

async function resetDay(chk, habit) {
    const target = parseInt(chk.dataset.target || '1', 10);
    const prev = parseInt(chk.dataset.count || '0', 10);
    paintCheckbox(chk, 0, target);
    try {
        await api.post(`/api/v1/habits/${habit.id}/completions`, {
            count: 0,
            date: chk.dataset.date,
            date_fmt: '%Y-%m-%d',
        });
    } catch (err) {
        paintCheckbox(chk, prev, target);
        toast(err.message, 'error');
    }
}

async function fetchHabitDetail(habitId) {
    try { return await api.get(`/api/v1/habits/${habitId}`); }
    catch { return null; }
}

function renderRow(habit) {
    const row = document.createElement('div');
    row.className = 'hrow';
    row.dataset.habitId = habit.id;

    const target = habit.target_count || 1;

    const icon = document.createElement('div');
    icon.className = 'hicon';
    icon.textContent = habit.icon || '📌';
    icon.title = 'Drag to reorder · Click to view detail';
    icon.addEventListener('click', () => window.location = `/habits/${habit.id}`);

    const name = document.createElement('div');
    name.className = 'hname';
    name.textContent = habit.name + (target > 1 ? ` · ${target}×/day` : '');
    name.addEventListener('click', () => window.location = `/habits/${habit.id}`);

    const checks = document.createElement('div');
    checks.className = 'hchecks';

    let cachedRecords = habit.records || [];
    const getRecords = () => cachedRecords;

    for (let i = 6; i >= 0; i--) {
        const d = dateNDaysAgo(i);
        const iso = isoDate(d);
        const rec = recordFor(cachedRecords, iso);
        const cnt = rec ? (rec.count ?? (rec.done ? 1 : 0)) : 0;
        const chk = document.createElement('button');
        chk.className = 'hchk';
        chk.dataset.date = iso;
        chk.dataset.target = target;
        chk.title = iso;
        paintCheckbox(chk, cnt, target);
        attachCheckHandlers(chk, habit, getRecords, target);
        checks.appendChild(chk);
    }

    const editBtn = document.createElement('button');
    editBtn.className = 'ibtn';
    editBtn.textContent = '✎';
    editBtn.title = 'Edit';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openHabitModal(habit); });

    row.append(icon, name, checks, editBtn);

    fetchHabitDetail(habit.id).then(full => {
        if (!full) return;
        cachedRecords = full.records || [];
        const recordsByDay = new Map(cachedRecords.map(r => [r.day, r]));
        checks.querySelectorAll('.hchk').forEach(chk => {
            const r = recordsByDay.get(chk.dataset.date);
            const cnt = r ? (r.count ?? (r.done ? 1 : 0)) : 0;
            paintCheckbox(chk, cnt, target);
        });
    });

    return row;
}

// ── Icon grid in modal ───────────────────────────────────────────
function renderIconGrid(selected) {
    const g = document.getElementById('iconGrid');
    if (!g) return;
    g.innerHTML = '';
    ICON_PALETTE.forEach(emoji => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = emoji;
        if (emoji === selected) b.classList.add('on');
        b.addEventListener('click', () => {
            document.getElementById('habitIconIn').value = emoji;
            g.querySelectorAll('button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
        });
        g.appendChild(b);
    });
}

// ── Habit modal (add / edit) ─────────────────────────────────────
function openHabitModal(habit) {
    editingHabitId = habit?.id || null;
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit habit' : 'New habit';
    document.getElementById('habitNameIn').value = habit?.name || '';
    document.getElementById('habitTagsIn').value = (habit?.tags || []).join(', ');
    document.getElementById('habitIconIn').value = habit?.icon || '📌';

    // Frequency: weekly if period is set with type W, else daily.
    const periodSel = document.getElementById('habitPeriodIn');
    const targetIn = document.getElementById('habitTargetIn');
    if (habit?.period && habit.period.period_type === 'W') {
        periodSel.value = 'W';
        targetIn.value = habit.period.target_count || 1;
    } else {
        periodSel.value = 'D';
        targetIn.value = habit?.target_count || 1;
    }
    updateFrequencyHint();

    // Date started
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('habitStartedIn').value = habit?.date_started || today;

    document.getElementById('habitDeleteBtn').style.visibility = habit ? 'visible' : 'hidden';
    renderIconGrid(habit?.icon || '📌');
    document.getElementById('habitOv').classList.add('on');
    setTimeout(() => document.getElementById('habitNameIn').focus(), 50);
}

function updateFrequencyHint() {
    const period = document.getElementById('habitPeriodIn').value;
    const hint = document.getElementById('habitFreqHint');
    if (!hint) return;
    if (period === 'W') {
        hint.textContent = "Each tapped day counts once toward this week's target.";
    } else {
        hint.textContent = 'Each click adds one. The day shows as fully done when count reaches the target.';
    }
}

window.closeHabitModal = () => {
    document.getElementById('habitOv').classList.remove('on');
    editingHabitId = null;
};

async function saveHabitFromModal() {
    const name = document.getElementById('habitNameIn').value.trim();
    const tags = document.getElementById('habitTagsIn').value.split(',').map(s => s.trim()).filter(Boolean);
    const icon = document.getElementById('habitIconIn').value.trim() || '📌';
    const periodType = document.getElementById('habitPeriodIn').value; // 'D' or 'W'
    const rawTarget = Math.max(1, parseInt(document.getElementById('habitTargetIn').value || '1', 10));
    const date_started = document.getElementById('habitStartedIn').value || null;
    if (!name) { toast('Name is required', 'error'); return; }

    let target_count;
    let period;
    if (periodType === 'W') {
        target_count = 1;
        period = { period_type: 'W', period_count: 1, target_count: rawTarget };
    } else {
        target_count = rawTarget;
        period = { period_type: 'D', period_count: 1, target_count: 1 };
    }

    const payload = { name, tags, icon, target_count, period, date_started };

    try {
        if (editingHabitId) {
            await api.put(`/api/v1/habits/${editingHabitId}`, payload);
            toast('Saved');
        } else {
            await api.post('/api/v1/habits', payload);
            toast('Created');
        }
        closeHabitModal();
        await refreshHabits();
    } catch (e) { toast(e.message, 'error'); }
}

async function deleteHabitFromModal() {
    if (!editingHabitId) return;
    if (!confirm('Delete this habit?')) return;
    try {
        await api.delete(`/api/v1/habits/${editingHabitId}`);
        toast('Deleted');
        closeHabitModal();
        await refreshHabits();
    } catch (e) { toast(e.message, 'error'); }
}

function applyFilters(habits) {
    let out = habits;
    if (activeTag) out = out.filter(h => (h.tags || []).includes(activeTag));
    if (searchTerm) out = out.filter(h => h.name.toLowerCase().includes(searchTerm.toLowerCase()));
    if (sortMode === 'az') out = [...out].sort((a, b) => a.name.localeCompare(b.name));
    return out;
}

function renderTagSidebar() {
    const tagSet = new Set();
    allHabits.forEach(h => (h.tags || []).forEach(t => tagSet.add(t)));
    const ul = document.getElementById('tagList');
    if (!ul) return;
    if (tagSet.size === 0) {
        ul.innerHTML = '<li style="padding:8px 20px;font-size:11px;color:var(--text-muted)">No tags yet</li>';
        return;
    }
    ul.innerHTML = [...tagSet].map(t =>
        `<li class="fi-item${activeTag === t ? ' on' : ''}" data-tag="${t}"><div class="fn">#${t}</div></li>`
    ).join('');
    ul.querySelectorAll('.fi-item').forEach(el => {
        el.onclick = () => {
            activeTag = activeTag === el.dataset.tag ? null : el.dataset.tag;
            renderTagSidebar();
            renderGrid();
        };
    });
}

let sortableInstance = null;

function renderGrid() {
    const grid = document.getElementById('hgrid');
    if (!grid) return;
    grid.innerHTML = '';
    const filtered = applyFilters(allHabits);
    if (filtered.length === 0) {
        grid.innerHTML = '<div class="empty"><div class="empty-hex">⬡</div><p>No habits yet.</p><p class="hint">Click + Add to create one.</p></div>';
        return;
    }
    filtered.forEach(h => grid.appendChild(renderRow(h)));

    if (sortableInstance) sortableInstance.destroy();
    if (sortMode === 'manual' && window.Sortable) {
        sortableInstance = new window.Sortable(grid, {
            animation: 150,
            handle: '.hicon',
            onEnd: async () => {
                const order = [...grid.querySelectorAll('.hrow[data-habit-id]')].map(el => el.dataset.habitId);
                try { await api.put('/api/v1/habits/meta', { order }); } catch (e) { toast(e.message, 'error'); }
            },
        });
    }
}

export async function refreshHabits() {
    try {
        allHabits = await api.get('/api/v1/habits');
    } catch (e) {
        toast(e.message, 'error');
        return;
    }
    renderTagSidebar();
    renderGrid();
}

export async function renderHabitDetail() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;

    try {
        const habit = await api.get(`/api/v1/habits/${habitId}`);
        let subtitle = '';
        if (habit.period && habit.period.period_type === 'W' && habit.period.target_count > 1) {
            subtitle = ` · ${habit.period.target_count}×/week`;
        } else if (habit.target_count > 1) {
            subtitle = ` · ${habit.target_count}×/day`;
        }
        document.getElementById('dName').textContent = habit.name + subtitle;
        const meta = (habit.tags?.length ? habit.tags.map(t => '#' + t).join(' ') : 'No tags');
        document.getElementById('dMeta').textContent = meta;
        document.getElementById('dIcon').textContent = habit.icon || '📌';
        document.title = `${habit.name} · HabitLab`;
    } catch (e) { toast(e.message, 'error'); return; }

    try {
        const stats = await api.get(`/api/v1/habits/${habitId}/stats`);
        document.getElementById('dStreak').textContent = stats.streak;
        document.getElementById('d30').textContent = `${stats.percent_30d}%`;
        document.getElementById('dTotal').textContent = stats.total;
    } catch { /* leave placeholders */ }
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('hgrid')) return;
    refreshHabits();

    document.getElementById('addBtn')?.addEventListener('click', () => openHabitModal(null));
    document.getElementById('habitSaveBtn')?.addEventListener('click', saveHabitFromModal);
    document.getElementById('habitDeleteBtn')?.addEventListener('click', deleteHabitFromModal);
    document.getElementById('habitPeriodIn')?.addEventListener('change', updateFrequencyHint);
    document.getElementById('searchIn')?.addEventListener('input', (e) => { searchTerm = e.target.value; renderGrid(); });
    document.getElementById('sortSel')?.addEventListener('change', (e) => { sortMode = e.target.value; renderGrid(); });
    document.querySelectorAll('.tbtn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
        activeFilter = e.currentTarget.dataset.filter;
        renderGrid();
    }));
});
