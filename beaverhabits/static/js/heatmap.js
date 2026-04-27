import { api, toast } from '/static/js/api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isoDate(d) { return d.toISOString().slice(0, 10); }

// Render a clickable week-column heatmap with month + day-of-week labels.
// `host` should be the wrapper element returned by createHeatmapWrap().
export function renderSingleHeatmap(host, days, weeks = 26, habitId = null) {
    const grid = host.querySelector('.heatmap');
    const monthsEl = host.querySelector('.hm-months');
    grid.innerHTML = '';
    monthsEl.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const doneSet = new Set(days.filter(d => d.done).map(d => d.date));

    // Anchor on Monday so each column is a full Mon..Sun week.
    const todayDow = (today.getDay() + 6) % 7; // 0=Mon..6=Sun
    const lastMonday = new Date(today);
    lastMonday.setDate(lastMonday.getDate() - todayDow);
    const start = new Date(lastMonday);
    start.setDate(start.getDate() - (weeks - 1) * 7);

    const cellsByCol = [];
    for (let col = 0; col < weeks; col++) {
        const colCells = [];
        for (let row = 0; row < 7; row++) {
            const d = new Date(start);
            d.setDate(start.getDate() + col * 7 + row);
            const iso = isoDate(d);
            const isFuture = d > today;

            const cell = document.createElement('div');
            cell.className = 'hm-cell';
            cell.dataset.date = iso;
            cell.dataset.done = doneSet.has(iso) ? '1' : '0';
            if (doneSet.has(iso)) cell.classList.add('l3');
            if (isFuture) cell.classList.add('future');
            cell.title = `${iso}${doneSet.has(iso) ? ' ✓' : ''}`;
            if (!isFuture && habitId) {
                cell.addEventListener('click', () => toggleCell(cell, habitId));
            }
            grid.appendChild(cell);
            colCells.push({ cell, date: d });
        }
        cellsByCol.push(colCells);
    }

    // Month labels above the grid: one label per column where a new month begins.
    let lastMonthShown = -1;
    for (let col = 0; col < weeks; col++) {
        const firstOfCol = cellsByCol[col][0].date;
        const m = firstOfCol.getMonth();
        const lbl = document.createElement('div');
        lbl.className = 'hm-month-lbl';
        if (m !== lastMonthShown) {
            lbl.textContent = MONTHS[m];
            lastMonthShown = m;
        } else {
            lbl.textContent = '';
        }
        monthsEl.appendChild(lbl);
    }
}

async function refreshDetailStats(habitId) {
    try {
        const stats = await api.get(`/api/v1/habits/${habitId}/stats`);
        const streakEl = document.getElementById('dStreak');
        const d30El = document.getElementById('d30');
        const totalEl = document.getElementById('dTotal');
        if (streakEl) streakEl.textContent = stats.streak;
        if (d30El) d30El.textContent = `${stats.percent_30d}%`;
        if (totalEl) totalEl.textContent = stats.total;
    } catch { /* leave stale */ }
}

async function toggleCell(cell, habitId) {
    const wasDone = cell.dataset.done === '1';
    const nextDone = !wasDone;
    cell.dataset.done = nextDone ? '1' : '0';
    cell.classList.toggle('l3', nextDone);
    cell.title = `${cell.dataset.date}${nextDone ? ' ✓' : ''}`;
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            done: nextDone,
            date: cell.dataset.date,
            date_fmt: '%Y-%m-%d',
        });
        await refreshDetailStats(habitId);
    } catch (err) {
        cell.dataset.done = wasDone ? '1' : '0';
        cell.classList.toggle('l3', wasDone);
        toast(err.message, 'error');
    }
}

export async function renderHabitDetailHeatmap() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=1`);
    const days = data.years[0]?.days ?? [];
    const host = document.getElementById('dHeatmapWrap');
    renderSingleHeatmap(host, days, 26, habitId);
}

export async function renderMultiYearHeatmap() {
    const root = document.getElementById('multiYearRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;

    try {
        const habit = await api.get(`/api/v1/habits/${habitId}`);
        const nameEl = document.getElementById('myName');
        if (nameEl) nameEl.textContent = habit.name;
        document.title = `${habit.name} multi-year · HabitLab`;
    } catch { /* keep placeholder */ }

    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=5`);
    const container = document.getElementById('yearsContainer');
    container.innerHTML = '';
    for (const year of data.years) {
        const wrap = document.createElement('div');
        wrap.style.marginBottom = '20px';
        const title = document.createElement('div');
        title.className = 'ss-title';
        title.textContent = year.year;
        const grid = document.createElement('div');
        grid.className = 'heatmap year';

        const jan1 = new Date(year.year, 0, 1);
        const padStart = jan1.getDay();
        for (let i = 0; i < padStart; i++) {
            const empty = document.createElement('div');
            empty.style.background = 'transparent';
            grid.appendChild(empty);
        }
        for (const d of year.days) {
            const c = document.createElement('div');
            c.className = 'hm-cell' + (d.done ? ' l3' : '');
            c.title = d.date;
            grid.appendChild(c);
        }
        wrap.appendChild(title);
        wrap.appendChild(grid);
        container.appendChild(wrap);
    }
}
