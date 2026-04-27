import { api, toast } from '/static/js/api.js';

const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];

let state = null; // { habitId, target, year, month, recordsByDay }

function isoDate(d) { return d.toISOString().slice(0, 10); }

async function loadRecords(habitId) {
    // Pull a year of data and turn into a Map for O(1) lookup
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=1`);
    const map = new Map();
    for (const y of data.years) {
        for (const d of y.days) {
            map.set(d.date, d.count ?? (d.done ? (data.target_count || 1) : 0));
        }
    }
    return { map, target: data.target_count || 1 };
}

function paintDay(cell, count, target, today, cellDate) {
    cell.classList.remove('done', 'partial');
    cell.innerHTML = '';
    const dayNum = cellDate.getDate();

    if (cellDate > today) {
        cell.classList.add('future');
    } else {
        cell.classList.remove('future');
    }
    if (cellDate.getTime() === today.getTime()) {
        cell.classList.add('today');
    }

    const numEl = document.createElement('span');
    numEl.className = 'cal-num';
    numEl.textContent = dayNum;
    cell.appendChild(numEl);

    if (count >= target) {
        cell.classList.add('done');
    } else if (count > 0) {
        cell.classList.add('partial');
    }
    if (target > 1 && count > 0) {
        const cnt = document.createElement('span');
        cnt.className = 'cal-count';
        cnt.textContent = `${count}/${target}`;
        cell.appendChild(cnt);
    }
    cell.dataset.count = count;
}

function buildGrid(host) {
    const { year, month, target, recordsByDay } = state;
    const grid = host.querySelector('.cal-grid');
    grid.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    const todayObj = new Date();
    todayObj.setHours(0, 0, 0, 0);

    // Pad start so day 1 lands on the right column.
    // We use Mon-first (todayDow: 0=Mon..6=Sun)
    const padStart = (firstOfMonth.getDay() + 6) % 7;
    for (let i = 0; i < padStart; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day empty';
        grid.appendChild(empty);
    }

    // Days 1..N
    const next = new Date(year, month + 1, 1);
    const daysInMonth = Math.round((next - firstOfMonth) / (1000 * 60 * 60 * 24));
    for (let dnum = 1; dnum <= daysInMonth; dnum++) {
        const cellDate = new Date(year, month, dnum);
        const iso = isoDate(cellDate);
        const cnt = recordsByDay.get(iso) || 0;

        const cell = document.createElement('div');
        cell.className = 'cal-day';
        cell.dataset.date = iso;
        cell.title = iso;
        paintDay(cell, cnt, target, todayObj, cellDate);

        if (cellDate <= todayObj) {
            cell.addEventListener('click', () => stepDay(cell));
            cell.addEventListener('contextmenu', (e) => { e.preventDefault(); resetDay(cell); });
            // long-press fallback for mobile
            let pressTimer;
            cell.addEventListener('touchstart', () => {
                pressTimer = setTimeout(() => { cell.dataset.longPressed = '1'; resetDay(cell); }, 600);
            }, { passive: true });
            cell.addEventListener('touchend', () => clearTimeout(pressTimer));
            cell.addEventListener('click', (e) => {
                if (cell.dataset.longPressed === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    delete cell.dataset.longPressed;
                }
            }, { capture: true });
        }
        grid.appendChild(cell);
    }
}

function updateHeader(host) {
    const { year, month } = state;
    host.querySelector('.cal-title').textContent = `${MONTHS_LONG[month]} ${year}`;
    const next = new Date(year, month + 1, 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    host.querySelector('.cal-next').disabled = next > today;
}

async function refreshStats() {
    if (!state) return;
    try {
        const stats = await api.get(`/api/v1/habits/${state.habitId}/stats`);
        const streakEl = document.getElementById('dStreak');
        const d30El = document.getElementById('d30');
        const totalEl = document.getElementById('dTotal');
        if (streakEl) streakEl.textContent = stats.streak;
        if (d30El) d30El.textContent = `${stats.percent_30d}%`;
        if (totalEl) totalEl.textContent = stats.total;
    } catch { /* leave stale */ }
}

async function stepDay(cell) {
    const { habitId, target, recordsByDay } = state;
    const cur = parseInt(cell.dataset.count || '0', 10);
    let next;
    if (target === 1) next = cur >= 1 ? 0 : 1;
    else next = cur >= target ? 0 : cur + 1;

    const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
    const cellDate = new Date(cell.dataset.date + 'T00:00:00');

    const prev = cur;
    paintDay(cell, next, target, todayObj, cellDate);
    recordsByDay.set(cell.dataset.date, next);
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: next, date: cell.dataset.date, date_fmt: '%Y-%m-%d',
        });
        await refreshStats();
    } catch (err) {
        paintDay(cell, prev, target, todayObj, cellDate);
        recordsByDay.set(cell.dataset.date, prev);
        toast(err.message, 'error');
    }
}

async function resetDay(cell) {
    const { habitId, target, recordsByDay } = state;
    const prev = parseInt(cell.dataset.count || '0', 10);
    const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
    const cellDate = new Date(cell.dataset.date + 'T00:00:00');
    paintDay(cell, 0, target, todayObj, cellDate);
    recordsByDay.set(cell.dataset.date, 0);
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: 0, date: cell.dataset.date, date_fmt: '%Y-%m-%d',
        });
        await refreshStats();
    } catch (err) {
        paintDay(cell, prev, target, todayObj, cellDate);
        recordsByDay.set(cell.dataset.date, prev);
        toast(err.message, 'error');
    }
}

export async function renderMonthCalendar() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const { map, target } = await loadRecords(habitId);

    const today = new Date();
    state = {
        habitId,
        target,
        year: today.getFullYear(),
        month: today.getMonth(),
        recordsByDay: map,
    };

    const host = document.getElementById('dCalendar');
    if (!host) return;
    host.innerHTML = `
        <div class="cal-head">
            <button class="cal-nav cal-prev" type="button">‹</button>
            <div class="cal-title"></div>
            <button class="cal-nav cal-next" type="button">›</button>
        </div>
        <div class="cal-dows">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
        <div class="cal-grid"></div>`;
    host.querySelector('.cal-prev').addEventListener('click', () => {
        if (state.month === 0) { state.month = 11; state.year--; }
        else state.month--;
        updateHeader(host);
        buildGrid(host);
    });
    host.querySelector('.cal-next').addEventListener('click', () => {
        const next = new Date(state.year, state.month + 1, 1);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (next > today) return;
        if (state.month === 11) { state.month = 0; state.year++; }
        else state.month++;
        updateHeader(host);
        buildGrid(host);
    });
    updateHeader(host);
    buildGrid(host);
}
