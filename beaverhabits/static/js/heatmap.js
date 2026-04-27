import { api } from '/static/js/api.js';

function levelFor(streak) {
    if (streak >= 7) return 4;
    if (streak >= 4) return 3;
    if (streak >= 2) return 2;
    if (streak >= 1) return 1;
    return 0;
}

export function renderSingleHeatmap(container, days, weeks = 26) {
    container.innerHTML = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const doneSet = new Set(days.filter(d => d.done).map(d => d.date));
    const cells = weeks * 7;
    const start = new Date(today);
    start.setDate(start.getDate() - cells + 1);

    let streak = 0;
    for (let i = 0; i < cells; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const iso = d.toISOString().slice(0, 10);
        const cell = document.createElement('div');
        cell.className = 'hm-cell';
        if (doneSet.has(iso)) {
            streak += 1;
            cell.classList.add(`l${levelFor(streak)}`);
        } else {
            streak = 0;
        }
        cell.title = `${iso}${doneSet.has(iso) ? ' ✓' : ''}`;
        container.appendChild(cell);
    }
}

export async function renderHabitDetailHeatmap() {
    const root = document.getElementById('detailRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;
    const data = await api.get(`/api/v1/habits/${habitId}/heatmap?years=1`);
    const days = data.years[0]?.days ?? [];
    renderSingleHeatmap(document.getElementById('dHeatmap'), days, 26);
}

export async function renderMultiYearHeatmap() {
    const root = document.getElementById('multiYearRoot');
    if (!root) return;
    const habitId = root.dataset.habitId;

    try {
        const habit = await api.get(`/api/v1/habits/${habitId}`);
        const nameEl = document.getElementById('myName');
        if (nameEl) nameEl.textContent = habit.name;
        document.title = `${habit.name} multi-year · BeaverHabits`;
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
