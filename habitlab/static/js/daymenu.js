// Shared 3-option day context menu (Completed / Not completed / Clear).
// Reuses the existing .ctx-menu / .ctx-menu.open CSS. Singleton appended to <body>.

let _menu = null;
let _cleanup = null;

function ensureMenu() {
    if (_menu) return _menu;
    const m = document.createElement('div');
    m.className = 'ctx-menu day-menu';
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
    if (_menu) _menu.classList.remove('open');
    if (_cleanup) { _cleanup(); _cleanup = null; }
}

export function openDayMenu(x, y, { onComplete, onMissed, onClear }) {
    const m = ensureMenu();
    closeDayMenu(); // tear down any prior open + pending listeners

    const handlers = { complete: onComplete, miss: onMissed, clear: onClear };
    m.querySelectorAll('.ctx-menu-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            closeDayMenu();
            handlers[item.dataset.action]?.();
        };
    });

    m.classList.add('open');
    // Measure after .open applies display, then clamp to viewport.
    const rect = m.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - 8);
    const top = Math.min(y, window.innerHeight - rect.height - 8);
    m.style.left = `${Math.max(8, left)}px`;
    m.style.top = `${Math.max(8, top)}px`;

    // Close on outside click (capture) / Escape. Next tick so the opening click
    // doesn't immediately close it. Tracked via _cleanup to avoid accumulation.
    setTimeout(() => {
        const onDocClick = () => closeDayMenu();
        const onKey = (e) => { if (e.key === 'Escape') closeDayMenu(); };
        _cleanup = () => {
            document.removeEventListener('click', onDocClick, true);
            document.removeEventListener('keydown', onKey);
        };
        document.addEventListener('click', onDocClick, { capture: true });
        document.addEventListener('keydown', onKey);
    }, 0);
}
