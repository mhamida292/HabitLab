import { api, toast } from '/static/js/api.js';
import { openNoteEditor } from '/static/js/notes.js';
import { renderHabitDetailHeatmap } from '/static/js/heatmap.js';

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

function renderDayLabels() {
    const labels = document.getElementById('dayLabels');
    if (!labels) return;
    const out = [];
    for (let i = 6; i >= 0; i--) {
        const d = dateNDaysAgo(i);
        out.push(d.toLocaleDateString(undefined, { weekday: 'narrow' }));
    }
    labels.innerHTML = out.map(l => `<span>${l}</span>`).join('');
}

function statusFromRecords(records, isoDay) {
    const rec = records?.find(r => r.day === isoDay);
    if (!rec) return '';
    return rec.done ? 'yes' : '';
}

function attachCheckHandlers(chk, habit, getRecords) {
    let pressTimer = null;
    let longPressed = false;

    const startPress = () => {
        longPressed = false;
        pressTimer = setTimeout(() => {
            longPressed = true;
            const records = getRecords();
            const existing = (records || []).find(r => r.day === chk.dataset.date);
            openNoteEditor({
                habitId: habit.id,
                date: chk.dataset.date,
                existing,
                onSave: refreshHabits,
            });
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
        const cur = chk.dataset.status;
        const nextDone = cur !== 'yes';
        chk.dataset.status = nextDone ? 'yes' : '';
        chk.innerHTML = nextDone
            ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
            : '';
        try {
            await api.post(`/api/v1/habits/${habit.id}/completions`, {
                done: nextDone,
                date: chk.dataset.date,
                date_fmt: '%Y-%m-%d',
            });
        } catch (err) {
            chk.dataset.status = cur;
            chk.innerHTML = cur === 'yes'
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
                : '';
            toast(err.message, 'error');
        }
    });
}

async function fetchHabitDetail(habitId) {
    try { return await api.get(`/api/v1/habits/${habitId}`); }
    catch { return null; }
}

function renderRow(habit) {
    const row = document.createElement('div');
    row.className = 'hrow';
    row.dataset.habitId = habit.id;

    const icon = document.createElement('div');
    icon.className = 'hicon';
    icon.textContent = '📌';
    icon.title = 'Drag to reorder · Click to view detail';
    icon.addEventListener('click', () => window.location = `/habits/${habit.id}`);

    const name = document.createElement('div');
    name.className = 'hname';
    name.textContent = habit.name;
    name.addEventListener('click', () => window.location = `/habits/${habit.id}`);

    const checks = document.createElement('div');
    checks.className = 'hchecks';

    let cachedRecords = habit.records;
    const getRecords = () => cachedRecords;

    for (let i = 6; i >= 0; i--) {
        const d = dateNDaysAgo(i);
        const iso = isoDate(d);
        const cur = statusFromRecords(cachedRecords, iso);
        const chk = document.createElement('button');
        chk.className = 'hchk';
        chk.dataset.status = cur;
        chk.dataset.date = iso;
        chk.title = iso;
        if (cur === 'yes') chk.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>';
        attachCheckHandlers(chk, habit, getRecords);
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
        const doneSet = new Set(cachedRecords.filter(r => r.done).map(r => r.day));
        checks.querySelectorAll('.hchk').forEach(chk => {
            const iso = chk.dataset.date;
            const done = doneSet.has(iso);
            chk.dataset.status = done ? 'yes' : '';
            chk.innerHTML = done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : '';
        });
    });

    return row;
}

// ── Habit modal (add / edit) ─────────────────────────────────────
function openHabitModal(habit) {
    editingHabitId = habit?.id || null;
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit habit' : 'New habit';
    document.getElementById('habitNameIn').value = habit?.name || '';
    document.getElementById('habitTagsIn').value = (habit?.tags || []).join(', ');
    document.getElementById('habitDeleteBtn').style.visibility = habit ? 'visible' : 'hidden';
    document.getElementById('habitOv').classList.add('on');
    setTimeout(() => document.getElementById('habitNameIn').focus(), 50);
}

window.closeHabitModal = () => {
    document.getElementById('habitOv').classList.remove('on');
    editingHabitId = null;
};

async function saveHabitFromModal() {
    const name = document.getElementById('habitNameIn').value.trim();
    const tags = document.getElementById('habitTagsIn').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!name) { toast('Name is required', 'error'); return; }
    try {
        if (editingHabitId) {
            await api.put(`/api/v1/habits/${editingHabitId}`, { name, tags });
            toast('Saved');
        } else {
            await api.post('/api/v1/habits', { name });
            const created = await api.get('/api/v1/habits');
            const newest = created[created.length - 1];
            if (tags.length && newest) {
                await api.put(`/api/v1/habits/${newest.id}`, { tags });
            }
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
        document.getElementById('dName').textContent = habit.name;
        document.getElementById('dMeta').textContent = (habit.tags?.length ? habit.tags.map(t => '#' + t).join(' ') : 'No tags');
        document.title = `${habit.name} · BeaverHabits`;
    } catch (e) { toast(e.message, 'error'); return; }

    try {
        const stats = await api.get(`/api/v1/habits/${habitId}/stats`);
        document.getElementById('dStreak').textContent = stats.streak;
        document.getElementById('d30').textContent = `${stats.percent_30d}%`;
        document.getElementById('dTotal').textContent = stats.total;
    } catch { /* leave placeholders */ }

    await renderHabitDetailHeatmap();
}

document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('hgrid')) return;
    renderDayLabels();
    refreshHabits();

    document.getElementById('addBtn')?.addEventListener('click', () => openHabitModal(null));
    document.getElementById('habitSaveBtn')?.addEventListener('click', saveHabitFromModal);
    document.getElementById('habitDeleteBtn')?.addEventListener('click', deleteHabitFromModal);
    document.getElementById('searchIn')?.addEventListener('input', (e) => { searchTerm = e.target.value; renderGrid(); });
    document.getElementById('sortSel')?.addEventListener('change', (e) => { sortMode = e.target.value; renderGrid(); });
    document.querySelectorAll('.tbtn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
        e.currentTarget.classList.add('on');
        activeFilter = e.currentTarget.dataset.filter;
        renderGrid();
    }));
});
