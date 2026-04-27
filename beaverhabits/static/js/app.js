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

// ── Settings modal ──────────────────────────────────────────────
window.openSettings = async () => {
    document.getElementById('settingsOv')?.classList.add('on');
    await loadSettings();
};
window.closeSettings = () => document.getElementById('settingsOv')?.classList.remove('on');

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

    document.getElementById('wipeBtn')?.addEventListener('click', async () => {
        const typed = prompt('This permanently deletes every habit and your account. Type DELETE to confirm.');
        if (typed !== 'DELETE') return;
        try {
            await api.post('/auth/wipe');
        } catch (err) { toast(err.message, 'error'); return; }
        localStorage.removeItem('jwt');
        window.location.href = '/login';
    });
});

// ── Logout ───────────────────────────────────────────────────────
window.logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    localStorage.removeItem('jwt');
    window.location.href = '/login';
};
