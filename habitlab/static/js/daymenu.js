// Shared 3-option day context menu (Completed / Not completed / Clear).
// Reuses the existing .ctx-menu CSS class. Singleton appended to <body>.

let _menu = null;

function ensureMenu() {
    if (_menu) return _menu;
    const m = document.createElement('div');
    m.className = 'ctx-menu day-menu';
    m.style.display = 'none';
    m.innerHTML = `
        <div class="ctx-menu-item" data-action="complete"><span class="day-menu-dot ok">✓</span>Completed</div>
        <div class="ctx-menu-item" data-action="miss"><span class="day-menu-dot bad">✕</span>Not completed</div>
        <div class="ctx-menu-item" data-action="clear"><span class="day-menu-dot mut">○</span>Clear</div>
    `;
    document.body.appendChild(m);
    _menu = m;
    return m;
}

export function closeDayMenu() {
    if (_menu) _menu.style.display = 'none';
}

export function openDayMenu(x, y, { onComplete, onMissed, onClear }) {
    const m = ensureMenu();
    const handlers = { complete: onComplete, miss: onMissed, clear: onClear };

    // Rebind click handlers fresh each open (callbacks capture current day).
    m.querySelectorAll('.ctx-menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            closeDayMenu();
            handlers[item.dataset.action]?.();
        };
    });

    m.style.display = 'block';
    // Clamp to viewport.
    const rect = m.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    m.style.left = `${Math.max(8, left)}px`;
    m.style.top = `${Math.max(8, top)}px`;

    // Close on outside click / Escape (next tick so this open click doesn't close it).
    setTimeout(() => {
        const onDocClick = () => { closeDayMenu(); cleanup(); };
        const onKey = (e) => { if (e.key === 'Escape') { closeDayMenu(); cleanup(); } };
        function cleanup() {
            document.removeEventListener('click', onDocClick, true);
            document.removeEventListener('keydown', onKey);
        }
        document.addEventListener('click', onDocClick, { capture: true, once: true });
        document.addEventListener('keydown', onKey, { once: true });
    }, 0);
}
