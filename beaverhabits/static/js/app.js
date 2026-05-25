import { api, toast } from '/static/js/api.js';

// ── Theme toggle ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = theme === 'midnight' ? '☾' : '☀';
}

document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('theme') || 'midnight';
    applyTheme(saved);

    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const cur = localStorage.getItem('theme') || 'midnight';
        applyTheme(cur === 'midnight' ? 'arctic' : 'midnight');
    });
});

// ── Sidebar drawer (mobile) ─────────────────────────────────────
window.openSidebar = () => {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('shade')?.classList.add('open');
};
window.closeSidebar = () => {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('shade')?.classList.remove('open');
};

// ── Settings drawer ─────────────────────────────────────────────
window.openSettings = async () => {
    const drawer = document.getElementById('settingsDrawer');
    if (!drawer) return;
    drawer.classList.add('open');
    await loadSettings();
};
window.closeSettings = () => {
    document.getElementById('settingsDrawer')?.classList.remove('open');
};

async function loadSettings() {
    const themeSel = document.getElementById('setThemeSel');
    if (themeSel) themeSel.value = localStorage.getItem('theme') || 'midnight';

    try {
        const tokenInfo = await api.get('/api/v1/tokens');
        renderTokenView(tokenInfo.token);
    } catch (e) {
        const tv = document.getElementById('tokenView');
        if (tv) tv.textContent = `Error: ${e.message}`;
    }
}

function renderTokenView(token) {
    const tv = document.getElementById('tokenView');
    if (!tv) return;
    if (token) {
        tv.innerHTML = `
            <input class="finp" readonly value="${token}">
            <div style="display:flex;gap:6px;margin-top:8px">
                <button class="bgho" id="tokCopy">Copy</button>
                <button class="bdng" id="tokDelete">Delete</button>
            </div>`;
        document.getElementById('tokCopy').onclick = () => {
            navigator.clipboard.writeText(token);
            toast('Copied to clipboard');
        };
        document.getElementById('tokDelete').onclick = async () => {
            await api.delete('/api/v1/tokens');
            renderTokenView(null);
        };
    } else {
        tv.innerHTML = `<button class="bpri" id="tokCreate">Generate API token</button>`;
        document.getElementById('tokCreate').onclick = async () => {
            const result = await api.post('/api/v1/tokens');
            renderTokenView(result.token);
        };
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('setThemeSel')?.addEventListener('change', (e) => applyTheme(e.target.value));

    document.getElementById('cpSubmit')?.addEventListener('click', async () => {
        const cur = document.getElementById('cpCurrent').value;
        const next = document.getElementById('cpNew').value;
        if (!cur || next.length < 8) { toast('New password must be 8+ characters', 'error'); return; }
        try {
            await api.post('/auth/change-password', { current_password: cur, new_password: next });
            toast('Password changed');
            document.getElementById('cpCurrent').value = '';
            document.getElementById('cpNew').value = '';
        } catch (e) { toast(e.message, 'error'); }
    });

    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        try {
            const data = await api.get('/api/v1/export');
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `beaverhabits-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { toast(e.message, 'error'); }
    });

    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importFile')?.click();
    });

    document.getElementById('importFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const payload = JSON.parse(text);
            await api.post('/api/v1/import', payload);
            toast('Imported');
            window.location.reload();
        } catch (err) { toast(err.message, 'error'); }
    });

    document.getElementById('seedBtn')?.addEventListener('click', async () => {
        if (!confirm('Add 5 sample habits with 60 days of random history?')) return;
        try {
            const result = await api.post('/api/v1/seed/sample-data');
            toast(`Added ${result.added} habits`);
            window.location.reload();
        } catch (err) { toast(err.message, 'error'); }
    });

    const wipeBtn = document.getElementById('wipeBtn');
    if (wipeBtn) {
        wipeBtn.addEventListener('click', async () => {
            console.log('wipeBtn clicked');
            const typed = prompt('This permanently deletes every habit and your account. Type DELETE to confirm.');
            console.log('wipe confirmation typed:', typed);
            if (typed !== 'DELETE') return;
            try {
                await api.post('/auth/wipe');
            } catch (err) {
                console.error('wipe failed', err);
                toast(err.message, 'error');
                return;
            }
            localStorage.removeItem('jwt');
            window.location.href = '/login';
        });
    } else {
        console.warn('wipeBtn not found in DOM at app.js init');
    }
});

// ── Logout ───────────────────────────────────────────────────────
window.logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('jwt');
    window.location.href = '/login';
};

// ── Habit modal (add / edit) ──────────────────────────────────
let _editingHabit = null;

export function openHabitModal(habit) {
    _editingHabit = habit;
    const ov = document.getElementById('habitOv');
    if (!ov) return;
    document.getElementById('habitModalTitle').textContent = habit ? 'Edit Habit' : 'New Habit';
    document.getElementById('habitNameIn').value = habit?.name || '';
    document.getElementById('habitIconBtn').textContent = habit?.icon || '📌';
    document.getElementById('habitTagIn').value = habit?.tags?.[0] || '';
    document.getElementById('habitDeleteBtn').style.visibility = habit ? 'visible' : 'hidden';

    // Sub-goals
    const hasSubgoals = (habit?.sub_goals?.length || 0) > 0;
    document.getElementById('habitSubgoalToggle').checked = hasSubgoals;
    document.getElementById('subgoalSection').style.display = hasSubgoals ? 'flex' : 'none';
    document.getElementById('habitUnitIn').value = habit?.sub_goal_unit || '';
    renderSgModalList(habit?.sub_goals || []);

    ov.classList.add('on');
    document.getElementById('habitNameIn').focus();
}
window.openHabitModal = openHabitModal;

window.closeHabitModal = () => {
    document.getElementById('habitOv')?.classList.remove('on');
    _editingHabit = null;
};

window.toggleSubgoalSection = () => {
    const on = document.getElementById('habitSubgoalToggle').checked;
    document.getElementById('subgoalSection').style.display = on ? 'flex' : 'none';
    if (on && document.getElementById('sgModalList').children.length === 0) {
        addSubgoalRow();
    }
    updateSgPreview();
};

function renderSgModalList(subGoals) {
    const list = document.getElementById('sgModalList');
    list.innerHTML = '';
    subGoals.forEach(sg => appendSgRow(sg.name));
    if (window.Sortable) {
        new Sortable(list, { animation: 150, handle: '.sg-drag-handle' });
    }
    updateSgPreview();
}

window.addSubgoalRow = function(name = '') {
    appendSgRow(name);
    updateSgPreview();
};

function appendSgRow(name) {
    const list = document.getElementById('sgModalList');
    const item = document.createElement('div');
    item.className = 'sg-list-item';
    item.innerHTML = `
        <span class="sg-drag-handle">⠿</span>
        <input type="text" placeholder="Sub-goal name" value="${name.replace(/"/g, '&quot;')}">
        <button type="button" onclick="this.closest('.sg-list-item').remove();updateSgPreview()">✕</button>`;
    item.querySelector('input').addEventListener('input', updateSgPreview);
    list.appendChild(item);
}

window.updateSgPreview = function() {
    const names = [...document.querySelectorAll('#sgModalList input')].map(i => i.value.trim()).filter(Boolean);
    const unit = document.getElementById('habitUnitIn')?.value || 'items';
    document.getElementById('sgPreview').textContent = `Preview: 0 / ${names.length} ${unit}`;
};

document.getElementById('habitUnitIn')?.addEventListener('input', window.updateSgPreview);

window.saveHabit = async function() {
    const name = document.getElementById('habitNameIn').value.trim();
    if (!name) { toast('Name is required', 'error'); return; }

    const icon = document.getElementById('habitIconBtn').textContent;
    const tag = document.getElementById('habitTagIn').value.trim();
    const hasSubgoals = document.getElementById('habitSubgoalToggle').checked;

    let sub_goals = [];
    let sub_goal_unit = null;
    if (hasSubgoals) {
        const names = [...document.querySelectorAll('#sgModalList input')].map(i => i.value.trim()).filter(Boolean);
        if (names.length === 0) { toast('Add at least one sub-goal', 'error'); return; }
        sub_goals = names.map(n => ({ id: n.toLowerCase().replace(/\s+/g, '_'), name: n }));
        sub_goal_unit = document.getElementById('habitUnitIn').value.trim() || 'items';
    }

    const body = {
        name, icon,
        tags: tag ? [tag] : [],
        sub_goals,
        ...(sub_goal_unit && { sub_goal_unit }),
    };

    try {
        if (_editingHabit) {
            await api.put(`/api/v1/habits/${_editingHabit.id}`, body);
        } else {
            await api.post('/api/v1/habits', body);
        }
        toast(_editingHabit ? 'Saved' : 'Created');
        window.closeHabitModal();
        const { refreshHabits } = await import('/static/js/habits.js');
        await refreshHabits();
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteCurrentHabit = async function() {
    if (!_editingHabit) return;
    if (!confirm(`Delete "${_editingHabit.name}"? This cannot be undone.`)) return;
    try {
        await api.delete(`/api/v1/habits/${_editingHabit.id}`);
        window.closeHabitModal();
        const { refreshHabits } = await import('/static/js/habits.js');
        await refreshHabits();
        toast('Deleted');
    } catch (e) { toast(e.message, 'error'); }
};

// Icon picker (simple — emoji typed directly into the button)
window.openIconPicker = function() {
    document.getElementById('habitIconBtn').focus();
};
