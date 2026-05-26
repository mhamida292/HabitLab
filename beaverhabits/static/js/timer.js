// beaverhabits/static/js/timer.js — Pomodoro focus timer

// ── State ─────────────────────────────────────────────────────
const DEFAULTS = { work: 25, break: 5 };
let state = {
    mode: 'work',        // 'work' | 'break'
    remaining: 0,        // seconds
    running: false,
    workMin: parseInt(localStorage.getItem('timer-work') || DEFAULTS.work),
    breakMin: parseInt(localStorage.getItem('timer-break') || DEFAULTS.break),
};
let _interval = null;

// ── Helpers ───────────────────────────────────────────────────
function fmtTime(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function totalSeconds() {
    return (state.mode === 'work' ? state.workMin : state.breakMin) * 60;
}

function pct() {
    const total = totalSeconds();
    return total > 0 ? (total - state.remaining) / total : 0;
}

// ── Core controls ─────────────────────────────────────────────
function startTimer() {
    if (state.remaining === 0) state.remaining = totalSeconds();
    state.running = true;
    clearInterval(_interval);
    _interval = setInterval(() => {
        if (!state.running) return;
        state.remaining--;
        updateUI();
        updateNavPill();
        if (state.remaining <= 0) onTimerEnd();
    }, 1000);
    updateUI();
    updateNavPill();
}

function pauseTimer() {
    state.running = false;
    clearInterval(_interval);
    updateUI();
    updateNavPill();
}

function resetTimer() {
    state.running = false;
    clearInterval(_interval);
    state.remaining = totalSeconds();
    updateUI();
    updateNavPill();
}

function skipPhase() {
    state.running = false;
    clearInterval(_interval);
    state.mode = state.mode === 'work' ? 'break' : 'work';
    state.remaining = totalSeconds();
    updateUI();
    updateNavPill();
}

function playChime() {
    try {
        const ctx = new AudioContext();
        // C5 → E5 → G5 arpeggio — pleasant bell chime
        [523.25, 659.25, 783.99].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            const t = ctx.currentTime + i * 0.18;
            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(0.22, t + 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
            osc.start(t);
            osc.stop(t + 1.4);
        });
    } catch (e) { /* AudioContext blocked — silently skip */ }
}

function onTimerEnd() {
    state.running = false;
    clearInterval(_interval);
    const label = state.mode === 'work' ? 'Work session done! Time for a break.' : 'Break over — back to work!';
    playChime();
    // Browser notification
    if (Notification.permission === 'granted') {
        new Notification('HabitLab Timer', { body: label, icon: '/static/logo-mark.svg' });
    }
    // Auto-switch mode
    state.mode = state.mode === 'work' ? 'break' : 'work';
    state.remaining = totalSeconds();
    updateUI();
    updateNavPill();
    // Flash the overlay if visible
    const overlay = document.getElementById('timerOverlay');
    if (overlay?.classList.contains('on')) {
        overlay.classList.add('flash');
        setTimeout(() => overlay.classList.remove('flash'), 600);
    }
}

// ── UI sync ───────────────────────────────────────────────────
function updateUI() {
    const overlay = document.getElementById('timerOverlay');
    if (!overlay) return;

    const display = overlay.querySelector('.timer-display');
    const ring = overlay.querySelector('.timer-ring-fill');
    const modeLabel = overlay.querySelector('.timer-mode');
    const startBtn = overlay.querySelector('#timerStartBtn');
    const workInp = overlay.querySelector('#timerWorkMin');
    const breakInp = overlay.querySelector('#timerBreakMin');

    if (display) display.textContent = fmtTime(state.remaining || totalSeconds());
    if (modeLabel) {
        modeLabel.textContent = state.mode === 'work' ? 'FOCUS' : 'BREAK';
        modeLabel.dataset.mode = state.mode;
    }
    if (startBtn) startBtn.textContent = state.running ? 'Pause' : 'Start';

    // SVG ring — circumference of r=54 circle ≈ 339.3
    if (ring) {
        const circ = 339.3;
        const offset = circ * (1 - pct());
        ring.style.strokeDashoffset = offset;
    }

    if (workInp && !state.running) workInp.value = state.workMin;
    if (breakInp && !state.running) breakInp.value = state.breakMin;
}

function updateNavPill() {
    const pill = document.getElementById('timerNavPill');
    if (!pill) return;
    if (state.running || (state.remaining > 0 && state.remaining < totalSeconds())) {
        pill.style.display = 'flex';
        pill.textContent = fmtTime(state.remaining);
        pill.dataset.mode = state.mode;
    } else {
        pill.style.display = 'none';
    }
}

// ── Open / close overlay ──────────────────────────────────────
function openTimer() {
    // Request notification permission on first open
    if (Notification.permission === 'default') {
        Notification.requestPermission();
    }
    const overlay = document.getElementById('timerOverlay');
    if (!overlay) return;
    overlay.classList.add('on');
    updateUI();
}

function closeTimer() {
    document.getElementById('timerOverlay')?.classList.remove('on');
}

// ── Duration inputs ───────────────────────────────────────────
function setWorkMin(val) {
    const n = Math.max(1, Math.min(120, parseInt(val) || DEFAULTS.work));
    state.workMin = n;
    localStorage.setItem('timer-work', n);
    if (state.mode === 'work' && !state.running) {
        state.remaining = n * 60;
    }
    updateUI();
}

function setBreakMin(val) {
    const n = Math.max(1, Math.min(60, parseInt(val) || DEFAULTS.break));
    state.breakMin = n;
    localStorage.setItem('timer-break', n);
    if (state.mode === 'break' && !state.running) {
        state.remaining = n * 60;
    }
    updateUI();
}

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    state.remaining = totalSeconds();

    document.getElementById('timerNavBtn')?.addEventListener('click', openTimer);
    document.getElementById('timerNavPill')?.addEventListener('click', openTimer);
    document.getElementById('timerMobileBtn')?.addEventListener('click', openTimer);
    document.getElementById('timerCloseBtn')?.addEventListener('click', closeTimer);
    document.getElementById('timerStartBtn')?.addEventListener('click', () => {
        state.running ? pauseTimer() : startTimer();
    });
    document.getElementById('timerResetBtn')?.addEventListener('click', resetTimer);
    document.getElementById('timerSkipBtn')?.addEventListener('click', skipPhase);

    document.getElementById('timerWorkMin')?.addEventListener('change', e => setWorkMin(e.target.value));
    document.getElementById('timerBreakMin')?.addEventListener('change', e => setBreakMin(e.target.value));

    // Close on backdrop click
    document.getElementById('timerOverlay')?.addEventListener('click', e => {
        if (e.target === document.getElementById('timerOverlay')) closeTimer();
    });

    updateUI();
    updateNavPill();
});
