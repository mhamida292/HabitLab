import { api, toast } from '/static/js/api.js';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function isoDate(d) { return d.toISOString().slice(0, 10); }

function paintHmCell(cell, count, target) {
    cell.classList.remove('l1', 'l2', 'l3', 'l4');
    cell.dataset.count = count;
    cell.innerHTML = '';
    if (count <= 0) return;
    const ratio = Math.min(1, count / target);
    let level = 1;
    if (ratio >= 1) level = 4;
    else if (ratio >= 0.66) level = 3;
    else if (ratio >= 0.33) level = 2;
    cell.classList.add(`l${level}`);
    if (target > 1) {
        cell.innerHTML = `<span class="hm-count">${count}/${target}</span>`;
    }
}

// Render a clickable week-column heatmap with month + day-of-week labels.
export function renderSingleHeatmap(host, days, weeks = 26, habitId = null, target = 1) {
    const grid = host.querySelector('.heatmap');
    const monthsEl = host.querySelector('.hm-months');
    grid.innerHTML = '';
    monthsEl.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const countByDay = new Map(days.map(d => [d.date, d.count ?? (d.done ? target : 0)]));

    const todayDow = (today.getDay() + 6) % 7;
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
            const cnt = countByDay.get(iso) || 0;

            const cell = document.createElement('div');
            cell.className = 'hm-cell';
            cell.dataset.date = iso;
            cell.dataset.target = target;
            paintHmCell(cell, cnt, target);
            if (isFuture) cell.classList.add('future');
            cell.title = `${iso}${cnt ? ` · ${cnt}/${target}` : ''}`;
            if (!isFuture && habitId) {
                cell.addEventListener('click', () => stepCell(cell, habitId, target));
                cell.addEventListener('contextmenu', (e) => { e.preventDefault(); resetCell(cell, habitId, target); });
            }
            grid.appendChild(cell);
            colCells.push({ cell, date: d });
        }
        cellsByCol.push(colCells);
    }

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

async function stepCell(cell, habitId, target) {
    const cur = parseInt(cell.dataset.count || '0', 10);
    let next;
    if (target === 1) {
        next = cur >= 1 ? 0 : 1;
    } else {
        next = cur >= target ? 0 : cur + 1;
    }
    const prev = cur;
    paintHmCell(cell, next, target);
    cell.title = `${cell.dataset.date}${next ? ` · ${next}/${target}` : ''}`;
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: next,
            date: cell.dataset.date,
            date_fmt: '%Y-%m-%d',
        });
        await refreshDetailStats(habitId);
    } catch (err) {
        paintHmCell(cell, prev, target);
        toast(err.message, 'error');
    }
}

async function resetCell(cell, habitId, target) {
    const prev = parseInt(cell.dataset.count || '0', 10);
    paintHmCell(cell, 0, target);
    try {
        await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: 0,
            date: cell.dataset.date,
            date_fmt: '%Y-%m-%d',
        });
        await refreshDetailStats(habitId);
    } catch (err) {
        paintHmCell(cell, prev, target);
        toast(err.message, 'error');
    }
}

export async function renderHabitDetailHeatmap() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=1`);
    const days = data.years[0]?.days ?? [];
    const target = data.target_count || 1;
    const host = document.getElementById('dHeatmapWrap');
    renderSingleHeatmap(host, days, 26, habitId, target);
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
