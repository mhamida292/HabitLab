import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons, isEmoji, ICON_NAMES } from '/static/js/icons.js';

// ── Theme toggle ─────────────────────────────────────────────────
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
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

// ── Settings modal ──────────────────────────────────────────────
window.openSettings = async () => {
    document.getElementById('settingsOv')?.classList.add('on');
    await loadSettings();
};
window.closeSettings = () => {
    document.getElementById('settingsOv')?.classList.remove('on');
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
    setIconBtn(habit?.icon || 'map-pin');
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

    const icon = document.getElementById('habitIconBtn').dataset.iconValue || 'map-pin';
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

    try {
        if (_editingHabit) {
            // PUT accepts all fields including sub_goals
            await api.put(`/api/v1/habits/${_editingHabit.id}`, {
                name, icon,
                tags: tag ? [tag] : [],
                sub_goals,
                ...(sub_goal_unit && { sub_goal_unit }),
            });
        } else {
            // POST only accepts name/icon/tags — sub_goals must be set via a follow-up PUT
            const created = await api.post('/api/v1/habits', {
                name, icon, tags: tag ? [tag] : [],
            });
            if (sub_goals.length > 0 && created.id) {
                await api.put(`/api/v1/habits/${created.id}`, {
                    sub_goals,
                    ...(sub_goal_unit && { sub_goal_unit }),
                });
            }
        }
        toast(_editingHabit ? 'Saved' : 'Created');
        window.closeHabitModal();
        await window._refreshHabits?.();
    } catch (e) { toast(e.message, 'error'); }
};

window.deleteCurrentHabit = async function() {
    if (!_editingHabit) return;
    if (!confirm(`Delete "${_editingHabit.name}"? This cannot be undone.`)) return;
    try {
        await api.delete(`/api/v1/habits/${_editingHabit.id}`);
        window.closeHabitModal();
        await window._refreshHabits?.();
        toast('Deleted');
    } catch (e) { toast(e.message, 'error'); }
};

// ── Icon button helpers ────────────────────────────────────────
function setIconBtn(value) {
    const btn = document.getElementById('habitIconBtn');
    if (!btn) return;
    btn.dataset.iconValue = value || 'map-pin';
    btn.innerHTML = '';
    const el = buildIconEl(value || 'map-pin', 22);
    // Give lucide icons the right colour
    if (!isEmoji(value)) el.style.color = 'var(--text-secondary)';
    btn.appendChild(el);
    applyIcons();
}

// ── Icon picker — fixed-position popup appended to <body> ──────
let _iconPickerEl = null;

function _getOrCreateIconPicker() {
    if (_iconPickerEl) return _iconPickerEl;
    const div = document.createElement('div');
    div.style.cssText = `
        display:none; position:fixed; z-index:9999;
        background:var(--bg-surface); border:1px solid var(--border);
        border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.35);
        padding:10px;
    `;
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:4px;width:272px';
    div.appendChild(grid);
    document.body.appendChild(div);
    _iconPickerEl = div;
    return div;
}

window.openIconPicker = function(e) {
    e.stopPropagation();
    const popup = _getOrCreateIconPicker();
    const grid  = popup.firstElementChild;

    if (popup.style.display !== 'none') { popup.style.display = 'none'; return; }

    const current = document.getElementById('habitIconBtn').dataset.iconValue || 'map-pin';
    grid.innerHTML = '';

    ICON_NAMES.forEach(name => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isCurrent = name === current;
        btn.style.cssText = `
            width:30px;height:30px;border:none;border-radius:6px;cursor:pointer;
            display:flex;align-items:center;justify-content:center;
            color:var(--text-secondary);
            background:${isCurrent ? 'var(--accent)' : 'transparent'};
        `;
        if (isCurrent) btn.style.color = '#fff';
        const icon = buildIconEl(name, 16);
        btn.appendChild(icon);
        btn.addEventListener('mouseenter', () => {
            if (!isCurrent) { btn.style.background = 'var(--bg-elevated)'; }
        });
        btn.addEventListener('mouseleave', () => {
            if (!isCurrent) { btn.style.background = 'transparent'; }
        });
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            setIconBtn(name);
            popup.style.display = 'none';
        });
        grid.appendChild(btn);
    });

    popup.style.display = 'block';
    applyIcons();

    // Position anchored below icon button, fixed to viewport
    const rect = document.getElementById('habitIconBtn').getBoundingClientRect();
    const pw = popup.offsetWidth || 292;
    const ph = popup.offsetHeight || 220;
    let left = rect.left;
    let top  = rect.bottom + 4;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top + ph > window.innerHeight - 8) top = rect.top - ph - 4;
    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;

    setTimeout(() => {
        document.addEventListener('click', function handler(ev) {
            if (!popup.contains(ev.target)) {
                popup.style.display = 'none';
                document.removeEventListener('click', handler);
            }
        });
    }, 0);
};
