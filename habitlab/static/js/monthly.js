// beaverhabits/static/js/monthly.js
import { api, toast } from '/static/js/api.js';
import { openDayMenu } from '/static/js/daymenu.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOWS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Local ISO helper — avoids UTC offset shifting the date for UTC+ users
function localIso(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Module state ─────────────────────────────────────────────
let calState = null;
// calState = { habitId, subGoals, target, year, month, recordsByDay }
// recordsByDay: Map<'YYYY-MM-DD', { count, done, sub_goals_done, missed }>

// ── Public API ───────────────────────────────────────────────

/**
 * Mount the monthly calendar into #calContainer.
 * Called by habits.js when a habit is selected.
 * @param {string}   habitId
 * @param {Array}    subGoals  [{id, name}, ...]
 * @param {number}   target
 * @param {Array}    records   [{day, count, done, sub_goals_done}, ...]
 * @param {Function} onToggle  optional callback(iso) called after a successful toggle
 */
export function mountCalendar(habitId, subGoals, target, records, onToggle) {
    const today = new Date();
    const map = new Map();
    for (const r of records) {
        map.set(r.day, { count: r.count, done: r.done, sub_goals_done: r.sub_goals_done || [], missed: r.missed || false });
    }
    calState = {
        habitId, subGoals, target,
        year: today.getFullYear(), month: today.getMonth(),
        recordsByDay: map,
        onToggle: onToggle || null,
    };

    const host = document.getElementById('calContainer');
    if (!host) return;
    host.innerHTML = `
        <div class="cal-nav-row">
            <button class="cal-nav-btn" id="calPrev">‹</button>
            <div class="cal-month-label" id="calMonthLabel"></div>
            <button class="cal-nav-btn" id="calNext">›</button>
        </div>
        <div class="cal-dows">${DOWS.map(d=>`<span>${d}</span>`).join('')}</div>
        <div class="cal-grid" id="calGrid"></div>`;

    host.querySelector('#calPrev').addEventListener('click', () => shiftMonth(-1, host));
    host.querySelector('#calNext').addEventListener('click', () => shiftMonth(1, host));
    renderCalGrid(host);
}

function shiftMonth(delta, host) {
    calState.month += delta;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    renderCalGrid(host);
}

function renderCalGrid(host) {
    if (!calState) return;
    const { year, month, recordsByDay, subGoals, target } = calState;
    const label = host.querySelector('#calMonthLabel');
    if (label) label.textContent = `${MONTHS[month]} ${year}`;

    const nextBtn = host.querySelector('#calNext');
    const today = new Date(); today.setHours(0,0,0,0);
    const nextMonthStart = new Date(year, month + 1, 1);
    if (nextBtn) nextBtn.disabled = nextMonthStart > today;

    const grid = host.querySelector('#calGrid');
    grid.innerHTML = '';

    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDow = firstOfMonth.getDay(); // 0=Sun

    // Pad with out-of-month cells (previous month)
    for (let i = 0; i < startDow; i++) {
        const cell = document.createElement('div');
        cell.className = 'cal-circle out-of-month';
        const prevDate = new Date(year, month, -(startDow - i - 1));
        cell.textContent = prevDate.getDate();
        grid.appendChild(cell);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        const iso = localIso(cellDate);
        const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [], missed: false };
        const isFuture = cellDate > today;
        const isToday = cellDate.getTime() === today.getTime();

        const cell = document.createElement('div');
        cell.className = 'cal-circle';
        if (isFuture) cell.classList.add('future');
        if (isToday) cell.classList.add('today');
        cell.dataset.date = iso;

        paintCalCircle(cell, rec, subGoals, target);

        if (!isFuture) {
            cell.addEventListener('click', () => onCalCircleClick(cell, iso));
            cell.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                openCalDayMenu(cell, iso, e.clientX, e.clientY);
            });
        }
        grid.appendChild(cell);
    }
}

function paintCalCircle(cell, rec, subGoals, target) {
    cell.classList.remove('done', 'partial', 'missed');
    cell.style.background = '';
    cell.innerHTML = '';

    const dayNum = new Date(cell.dataset.date + 'T00:00:00').getDate();

    // Never render done/partial state for future dates — data may exist but shouldn't display
    const isFuture = cell.classList.contains('future');
    if (isFuture) {
        const span = document.createElement('span');
        span.textContent = dayNum;
        cell.appendChild(span);
        return;
    }

    if (rec.missed && !rec.done && rec.count < target) {
        cell.classList.add('missed');
        const x = document.createElement('span');
        x.className = 'cal-x';
        x.textContent = '✕';
        cell.appendChild(x);
        return;
    }

    if (rec.done || rec.count >= target) {
        cell.classList.add('done');
        cell.innerHTML = '<span>✓</span>';
    } else if (subGoals.length > 0 && rec.sub_goals_done.length > 0) {
        // Partial — draw conic ring
        cell.classList.add('partial');
        const pct = rec.sub_goals_done.length / subGoals.length;
        const deg = Math.round(pct * 360);
        cell.style.background = `conic-gradient(var(--accent) 0deg ${deg}deg, var(--bg-input) ${deg}deg 360deg)`;
        const inner = document.createElement('div');
        inner.style.cssText = `width:calc(100% - 6px);height:calc(100% - 6px);border-radius:50%;background:var(--bg-primary);display:flex;align-items:center;justify-content:center;font-size:11px;`;
        inner.textContent = rec.sub_goals_done.length;
        cell.appendChild(inner);
    } else {
        cell.style.background = '';
        const span = document.createElement('span');
        span.textContent = dayNum;
        cell.appendChild(span);
    }
}

async function onCalCircleClick(cell, iso) {
    if (!calState) return;
    const { habitId, subGoals, target, recordsByDay } = calState;

    if (subGoals.length > 0) {
        openSubgoalPicker(cell, iso);
        return;
    }

    // Regular habit — step count
    const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [], missed: false };
    const newCount = rec.count >= target ? 0 : rec.count + 1;

    try {
        const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
            count: newCount, date: iso, date_fmt: '%Y-%m-%d',
        });
        const newRec = { count: result.count, done: result.done, sub_goals_done: result.sub_goals_done || [], missed: result.missed || false };
        recordsByDay.set(iso, newRec);
        paintCalCircle(cell, newRec, [], target);
        calState.onToggle?.(iso);
        document.dispatchEvent(new CustomEvent('cal:toggled', {
            detail: { habitId, iso, newRec, prevDone: rec.done },
        }));
    } catch (err) {
        toast(err.message, 'error');
    }
}

function openCalDayMenu(cell, iso, x, y) {
    if (!calState) return;
    const { habitId, subGoals, target, recordsByDay } = calState;

    async function send(body) {
        try {
            const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
                date: iso, date_fmt: '%Y-%m-%d', ...body,
            });
            const prev = recordsByDay.get(iso) || { done: false };
            const newRec = {
                count: result.count,
                done: result.done,
                sub_goals_done: result.sub_goals_done || [],
                missed: result.missed || false,
            };
            recordsByDay.set(iso, newRec);
            paintCalCircle(cell, newRec, subGoals, target);
            calState.onToggle?.(iso);
            document.dispatchEvent(new CustomEvent('cal:toggled', {
                detail: { habitId, iso, newRec, prevDone: prev.done },
            }));
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    openDayMenu(x, y, {
        onComplete: () => send({ done: true }),
        onMissed:   () => send({ missed: true }),
        onClear:    () => send({ missed: false, done: false }),
    });
}

// ── Sub-goal popup picker ─────────────────────────────────────

let popupOpenCell = null;

function openSubgoalPicker(cell, iso) {
    const { habitId, subGoals, recordsByDay } = calState;
    const rec = recordsByDay.get(iso) || { count: 0, done: false, sub_goals_done: [] };
    const donSet = new Set(rec.sub_goals_done);
    const isMobile = window.innerWidth < 768;
    const dateLabel = new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    if (isMobile) {
        openSgSheet(iso, dateLabel, subGoals, donSet, habitId, rec, recordsByDay, cell);
        return;
    }

    popupOpenCell = cell;
    const popup = document.getElementById('sgPopup');
    popup.innerHTML = `<div class="sg-popup-title">${dateLabel}</div>`;

    subGoals.forEach(sg => {
        const item = document.createElement('div');
        item.className = 'sg-popup-item' + (donSet.has(sg.id) ? ' checked' : '');
        item.innerHTML = `<div class="sg-check"></div><span>${sg.name}</span>`;
        item.addEventListener('click', async () => {
            await toggleSubgoal(habitId, iso, sg.id, rec, recordsByDay, cell);
            const freshRec = recordsByDay.get(iso);
            item.classList.toggle('checked', freshRec?.sub_goals_done?.includes(sg.id) ?? false);
        });
        popup.appendChild(item);
    });

    // Position near cell
    const rect = cell.getBoundingClientRect();
    popup.style.display = 'block';
    const pw = popup.offsetWidth || 200;
    let left = rect.right + 6;
    if (left + pw > window.innerWidth - 8) left = rect.left - pw - 6;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.min(rect.top, window.innerHeight - 200)}px`;

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closePopupOnOutside, { once: true, capture: true });
    }, 0);
}

function closePopupOnOutside(e) {
    const popup = document.getElementById('sgPopup');
    if (!popup.contains(e.target) && e.target !== popupOpenCell) {
        popup.style.display = 'none';
    }
}

function openSgSheet(iso, dateLabel, subGoals, donSet, habitId, rec, recordsByDay, cell) {
    document.getElementById('sgSheetTitle').textContent = dateLabel;
    const container = document.getElementById('sgSheetItems');
    container.innerHTML = '';
    subGoals.forEach(sg => {
        const item = document.createElement('div');
        item.className = 'sg-popup-item' + (donSet.has(sg.id) ? ' checked' : '');
        item.style.cssText = 'padding:13px 16px';
        item.innerHTML = `<div class="sg-check"></div><span>${sg.name}</span>`;
        item.addEventListener('click', async () => {
            await toggleSubgoal(habitId, iso, sg.id, rec, recordsByDay, cell);
            const freshRec = recordsByDay.get(iso);
            item.classList.toggle('checked', freshRec?.sub_goals_done?.includes(sg.id) ?? false);
        });
        container.appendChild(item);
    });
    document.getElementById('sgSheet').classList.add('open');
    document.getElementById('sgSheetShade').style.display = 'block';
}

window.closeSgSheet = function() {
    document.getElementById('sgSheet').classList.remove('open');
    document.getElementById('sgSheetShade').style.display = 'none';
};

async function toggleSubgoal(habitId, iso, sgId, rec, recordsByDay, cell) {
    try {
        const result = await api.post(`/api/v1/habits/${habitId}/completions`, {
            date: iso, date_fmt: '%Y-%m-%d', sub_goal_id: sgId,
        });
        const newRec = {
            count: result.count,
            done: result.done,
            sub_goals_done: result.sub_goals_done,
            missed: result.missed || false,
        };
        recordsByDay.set(iso, newRec);
        paintCalCircle(cell, newRec, calState.subGoals, calState.target);
        calState.onToggle?.(iso);
        document.dispatchEvent(new CustomEvent('cal:toggled', {
            detail: { habitId, iso, newRec, prevDone: rec.done },
        }));
    } catch (err) { toast(err.message, 'error'); }
}

// ── Daily goals line chart ────────────────────────────────────

/**
 * Render a daily-goals line chart into #chartWrap.
 * @param {number} target  target_count for the habit
 * @param {Array}  records [{day, count}, ...]
 */
export function renderDailyChart(target, records) {
    const wrap = document.getElementById('chartWrap');
    if (!wrap) return;

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Build count array [day1, day2, ..., dayN]
    const counts = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const iso = localIso(new Date(year, month, d));
        const rec = records.find(r => r.day === iso);
        counts.push(rec ? rec.count : 0);
    }

    const W = 300; const H = 80; const PAD = 4;
    const maxY = Math.max(target, ...counts, 1);
    const xStep = (W - PAD * 2) / (daysInMonth - 1 || 1);

    const pts = counts.map((c, i) => {
        const x = PAD + i * xStep;
        const y = H - PAD - ((c / maxY) * (H - PAD * 2));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    // Target line y
    const ty = (H - PAD - ((target / maxY) * (H - PAD * 2))).toFixed(1);

    // Filled area (polygon adds bottom corners)
    const firstPt = `${PAD},${H - PAD}`;
    const lastPt = `${(PAD + (daysInMonth - 1) * xStep).toFixed(1)},${H - PAD}`;
    const fillPts = `${firstPt} ${pts} ${lastPt}`;

    wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
            <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--accent)" stop-opacity=".3"/>
                <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
            </linearGradient>
        </defs>
        <!-- Fill -->
        <polygon points="${fillPts}" fill="url(#chartFill)"/>
        <!-- Target line -->
        <line x1="${PAD}" y1="${ty}" x2="${W - PAD}" y2="${ty}"
              stroke="var(--accent-light)" stroke-width="1" stroke-dasharray="3 3" opacity=".6"/>
        <!-- Data line -->
        <polyline points="${pts}"
                  fill="none" stroke="var(--accent)" stroke-width="1.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

/**
 * Update a single day in the calendar without re-mounting.
 * Called by habits.js after a list-row toggle to keep calendar in sync.
 * @param {string} iso  'YYYY-MM-DD'
 * @param {{count:number, done:boolean, sub_goals_done:string[]}} rec
 */
export function updateCalendarRecord(iso, rec) {
    if (!calState) return;
    calState.recordsByDay.set(iso, rec);
    // Re-paint the cell if it's currently visible in the grid
    const cell = document.querySelector(`.cal-circle[data-date="${iso}"]`);
    if (cell) paintCalCircle(cell, rec, calState.subGoals, calState.target);
}
