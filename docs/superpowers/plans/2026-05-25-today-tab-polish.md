# Today Tab Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Today tab with habit icons, task deletion (swipe mobile / hover-X desktop), a two-column desktop layout with a stats panel, and add archive/delete swipe + right-click context menu to the Habits page.

**Architecture:** All changes are purely frontend (CSS + JS). The two-column layout splits `.today-panel` into a fixed 340px list column and a flex-1 stats column. Swipe uses pointer/touch events translated to `translateX` on a wrapping element. The context menu is a singleton `<div>` appended to `<body>` and repositioned on each `contextmenu` event. No new API endpoints are needed.

**Tech Stack:** Vanilla JS ES modules, CSS custom properties, existing `api.js` / `icons.js` helpers, SortableJS (already vendored).

---

## File Map

| File | Change |
|------|--------|
| `beaverhabits/static/css/styles.css` | Icons, two-column layout, swipe rows, hover ✕, context menu |
| `beaverhabits/templates/today.html` | Restructure into two columns |
| `beaverhabits/static/js/today.js` | Habit icons, stats panel, task swipe/delete |
| `beaverhabits/static/js/habits.js` | Habit row swipe (mobile) + right-click context menu (desktop) |

---

## Task 1: Habit icons in Today tab

**Files:**
- Modify: `beaverhabits/static/js/today.js`
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 1.1: Add icon CSS**

Open `beaverhabits/static/css/styles.css`. Find `.today-drag {` (line ~947). Insert this rule immediately before it:

```css
.today-row-icon {
    width: 18px; text-align: center; flex-shrink: 0;
    font-size: 15px; line-height: 1;
    display: flex; align-items: center; justify-content: center;
}
```

- [ ] **Step 1.2: Add icons.js import to today.js**

Open `beaverhabits/static/js/today.js`. Line 1 is:
```javascript
import { api } from '/static/js/api.js';
```

Replace it with:
```javascript
import { api } from '/static/js/api.js';
import { isEmoji, applyIcons } from '/static/js/icons.js';
```

- [ ] **Step 1.3: Update `makeHabitRow` to render the icon**

Find `makeHabitRow`. The `row.innerHTML` currently starts with `<span class="today-drag">⠿</span>`. Replace the entire `row.innerHTML = \`...\`` assignment with:

```javascript
    // Build icon element
    const iconSpan = document.createElement('span');
    iconSpan.className = 'today-row-icon';
    if (h.icon) {
        if (isEmoji(h.icon)) {
            iconSpan.textContent = h.icon;
        } else {
            const i = document.createElement('i');
            i.dataset.lucide = h.icon;
            i.style.cssText = 'width:15px;height:15px;display:block';
            iconSpan.appendChild(i);
        }
    }

    row.innerHTML = `
        <span class="today-drag">⠿</span>
        <div class="today-check${done ? ' done' : ''}"></div>
        <span class="today-name${done ? ' done' : ''}">${escHtml(h.name)}</span>
        ${sgs.length > 0
            ? `<span class="today-badge habit">${doneCount}/${sgs.length}</span>`
            : `<span class="today-badge habit">habit</span>`}
    `;

    // Insert icon after the drag handle
    row.insertBefore(iconSpan, row.querySelector('.today-check'));
```

- [ ] **Step 1.4: Update `makePinSection` to show icons**

Find `makePinSection`. There is a `name` element set like:
```javascript
        name.style.cssText = 'font-size:0.875rem;color:var(--text-primary);';
        name.textContent = h.name;
```

After `row.appendChild(box);` and before `row.appendChild(name);`, insert:

```javascript
        const pinIcon = document.createElement('span');
        pinIcon.style.cssText = 'font-size:15px;width:20px;text-align:center;flex-shrink:0;';
        if (h.icon) {
            if (isEmoji(h.icon)) {
                pinIcon.textContent = h.icon;
            } else {
                const i = document.createElement('i');
                i.dataset.lucide = h.icon;
                i.style.cssText = 'width:15px;height:15px;display:block';
                pinIcon.appendChild(i);
            }
        }
        row.appendChild(pinIcon);
```

- [ ] **Step 1.5: Call `applyIcons()` at the end of `render()`**

Find the `render()` function. It ends with a call to `recalcProgress()`. After all the `list.appendChild(...)` calls, add at the very end of `render()`:

```javascript
    applyIcons();
```

- [ ] **Step 1.6: Smoke test**

Open `http://localhost:8765/today` (hard-refresh `Ctrl+Shift+R`). Verify:
- Each pinned habit row shows its emoji or Lucide icon to the left of the checkbox
- Icons also appear in the "Pin habits to today" section at the bottom
- Page renders without JS errors in DevTools console

- [ ] **Step 1.7: Commit**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
git add beaverhabits/static/js/today.js beaverhabits/static/css/styles.css
git commit -m "feat: show habit icons in Today tab rows and pin section"
```

---

## Task 2: Badge inline + two-column CSS

**Files:**
- Modify: `beaverhabits/static/css/styles.css`

- [ ] **Step 2.1: Remove `flex: 1` from `.today-name`**

Find `.today-name {` (line ~966). It currently reads:
```css
.today-name {
    flex: 1; font-size: 0.875rem; color: var(--text-primary); transition: color .15s;
}
```

Replace with:
```css
.today-name {
    flex: 1; min-width: 0;
    font-size: 0.875rem; color: var(--text-primary); transition: color .15s;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
```

(`flex: 1; min-width: 0` keeps the name growable but prevents it from pushing siblings to the far edge.)

- [ ] **Step 2.2: Add two-column layout CSS**

Find `.today-panel {` (line ~889). Replace the existing `.today-panel` and `.today-inner` rules and the mobile override for `.today-panel` with:

```css
.today-panel {
    flex: 1; display: flex; flex-direction: row; overflow: hidden;
}
.today-list-col {
    width: 340px; flex-shrink: 0;
    overflow-y: auto; padding: 28px 24px 32px;
    border-right: 1px solid var(--border);
}
.today-stats-col {
    flex: 1; overflow-y: auto; padding: 28px 24px 32px;
    display: flex; flex-direction: column; gap: 16px;
}
@media (max-width: 767px) {
    .today-panel { flex-direction: column; overflow-y: auto; }
    .today-list-col { width: 100%; border-right: none; padding: 20px 16px 32px; }
    .today-stats-col { display: none; }
}
```

- [ ] **Step 2.3: Add swipe-wrap CSS for task rows**

At the end of the today-page CSS block (before the `/* ── Pomodoro timer overlay */` comment), add:

```css
/* Task swipe-to-delete */
.today-task-wrap {
    position: relative; border-radius: 8px; overflow: hidden;
    margin-bottom: 0;
}
.today-task-del {
    position: absolute; right: 0; top: 0; bottom: 0; width: 60px;
    background: #b91c1c; display: flex; align-items: center; justify-content: center;
    cursor: pointer; border-radius: 0 8px 8px 0;
}
.today-task-inner {
    position: relative; z-index: 1;
    background: var(--bg); will-change: transform;
    border-radius: 8px;
}
.today-task-inner.swipe-snap {
    transition: transform .2s cubic-bezier(.25,.46,.45,.94);
}
/* Hover ✕ — desktop only */
.today-task-x {
    background: none; border: none; color: #ef4444;
    font-size: 15px; line-height: 1; cursor: pointer; padding: 0 2px;
    flex-shrink: 0; opacity: 0; transition: opacity .15s;
}
@media (hover: hover) {
    .today-task-inner:hover .today-task-x { opacity: 0.45; }
    .today-task-x:hover { opacity: 1 !important; }
}
@media (hover: none) {
    .today-task-x { display: none; }
}

/* Stats panel sections */
.stats-panel-section {
    background: var(--bg-surface); border-radius: 12px;
    padding: 14px 16px; border: 1px solid var(--border);
}
.stats-panel-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .06em; color: var(--text-muted); margin-bottom: 10px;
}
.stats-prog-cards { display: flex; gap: 8px; }
.stats-prog-card {
    flex: 1; background: var(--bg-elevated); border-radius: 8px;
    padding: 10px 8px; text-align: center;
}
.stats-prog-val { font-size: 22px; font-weight: 800; color: var(--accent); }
.stats-prog-lbl { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.stats-streak-row {
    display: flex; align-items: center; gap: 8px; padding: 5px 0;
    border-bottom: 1px solid var(--border);
}
.stats-streak-row:last-child { border-bottom: none; }
.stats-streak-icon { font-size: 14px; width: 18px; text-align: center; flex-shrink: 0; }
.stats-streak-name { flex: 1; font-size: 12px; color: var(--text-primary); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stats-streak-val { font-size: 12px; font-weight: 700; color: var(--accent); flex-shrink: 0; }
.stats-week-bars { display: flex; align-items: flex-end; gap: 4px; height: 48px; }
.stats-week-bar {
    flex: 1; background: var(--accent); border-radius: 3px 3px 0 0;
    opacity: .35; min-height: 3px; transition: opacity .15s;
}
.stats-week-bar.today-bar { opacity: 1; }
.stats-week-labels { display: flex; gap: 4px; margin-top: 4px; }
.stats-week-lbl { flex: 1; text-align: center; font-size: 9px; color: var(--text-muted); }
.stats-week-lbl.today-lbl { color: var(--accent); font-weight: 700; }
```

- [ ] **Step 2.4: Smoke test CSS**

Hard-refresh `http://localhost:8765/today`. The layout won't show yet (HTML not changed), but confirm no CSS parse errors in DevTools.

- [ ] **Step 2.5: Commit**

```bash
git add beaverhabits/static/css/styles.css
git commit -m "feat: two-column today layout CSS + task swipe + stats panel styles"
```

---

## Task 3: today.html — two-column structure

**Files:**
- Modify: `beaverhabits/templates/today.html`

- [ ] **Step 3.1: Restructure the template**

Open `beaverhabits/templates/today.html`. Replace the entire `{% block panels %}` block with:

```html
{% block panels %}
<div class="today-panel">

    <!-- ── List column ───────────────────────────────────── -->
    <div class="today-list-col">
        <div class="today-nav-row">
            <button class="today-nav-btn" id="todayPrevBtn" title="Previous day">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <div class="today-date" id="todayDate"></div>
            <button class="today-nav-btn" id="todayNextBtn" title="Next day">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
        </div>
        <div class="today-progress-wrap">
            <div class="today-progress-bar">
                <div class="today-progress-fill" id="todayProgressFill" style="width:0%"></div>
            </div>
            <span class="today-progress-label" id="todayProgressLabel">— / — done</span>
        </div>
        <div id="todayList"></div>
    </div>

    <!-- ── Stats column (desktop only) ──────────────────── -->
    <div class="today-stats-col" id="todayStatsPanel"></div>

</div>
{% endblock %}
```

- [ ] **Step 3.2: Smoke test**

Hard-refresh `http://localhost:8765/today`. Verify:
- List is in the left column (~340px wide)
- Right column is empty (stats JS not written yet) but exists in DOM
- Mobile: resize to < 768px — single column, right col hidden
- No JS errors in console

- [ ] **Step 3.3: Commit**

```bash
git add beaverhabits/templates/today.html
git commit -m "feat: restructure Today tab into two-column layout"
```

---

## Task 4: Stats panel JavaScript

**Files:**
- Modify: `beaverhabits/static/js/today.js`

- [ ] **Step 4.1: Add helper functions**

After the `escHtml` function (near the bottom of today.js), add:

```javascript
// ── Stats panel ───────────────────────────────────────────────
function computeStreak(habit) {
    const doneSet = new Set(
        (habit.records || [])
            .filter(r => {
                if ((habit.sub_goals || []).length > 0) {
                    return (r.sub_goals_done?.length || 0) >= habit.sub_goals.length;
                }
                return r.done;
            })
            .map(r => r.day)
    );
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
        const iso = localIso(d);
        if (!doneSet.has(iso)) break;
        streak++;
        d.setDate(d.getDate() - 1);
    }
    return streak;
}

function computeWeekBars(pinnedHabits) {
    // Returns array of 7 {iso, pct, isToday} objects, Mon → viewDay
    const bars = [];
    for (let i = 6; i >= 0; i--) {
        const iso = isoAddDays(TODAY, -i);
        const d = new Date(iso + 'T00:00:00');
        const label = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
        let done = 0;
        for (const h of pinnedHabits) {
            if (habitDone(h, iso)) done++;
        }
        const pct = pinnedHabits.length > 0 ? done / pinnedHabits.length : 0;
        bars.push({ iso, label, pct, isToday: iso === TODAY });
    }
    return bars;
}

function renderStatsPanel() {
    const panel = document.getElementById('todayStatsPanel');
    if (!panel) return;
    panel.innerHTML = '';

    const pinned = allHabits.filter(h => pinnedIds.includes(h.id));
    let habitsDone = 0, habitsTotal = 0, tasksDone = 0, tasksTotal = 0;
    for (const h of pinned) { habitsTotal++; if (habitDone(h, viewDay)) habitsDone++; }
    for (const t of taskItems) { tasksTotal++; if (t.done) tasksDone++; }
    const done = habitsDone + tasksDone;
    const total = habitsTotal + tasksTotal;
    const pct = total > 0 ? Math.round(done / total * 100) : 0;

    // ── Progress cards ──
    const progSection = document.createElement('div');
    progSection.className = 'stats-panel-section';
    progSection.innerHTML = `
        <div class="stats-panel-label">Today's progress</div>
        <div class="stats-prog-cards">
            <div class="stats-prog-card">
                <div class="stats-prog-val">${done}</div>
                <div class="stats-prog-lbl">Done</div>
            </div>
            <div class="stats-prog-card">
                <div class="stats-prog-val">${total - done}</div>
                <div class="stats-prog-lbl">Left</div>
            </div>
            <div class="stats-prog-card">
                <div class="stats-prog-val">${pct}%</div>
                <div class="stats-prog-lbl">Complete</div>
            </div>
        </div>
    `;
    panel.appendChild(progSection);

    // ── Habit streaks ──
    if (pinned.length > 0) {
        const streakSection = document.createElement('div');
        streakSection.className = 'stats-panel-section';
        const label = document.createElement('div');
        label.className = 'stats-panel-label';
        label.textContent = 'Habit streaks';
        streakSection.appendChild(label);

        for (const h of pinned) {
            const streak = computeStreak(h);
            const row = document.createElement('div');
            row.className = 'stats-streak-row';
            row.innerHTML = `
                <span class="stats-streak-icon">${isEmoji(h.icon || '') ? (h.icon || '📌') : '📌'}</span>
                <span class="stats-streak-name">${escHtml(h.name)}</span>
                <span class="stats-streak-val">${streak > 0 ? '🔥 ' + streak : '— 0'}</span>
            `;
            streakSection.appendChild(row);
        }
        panel.appendChild(streakSection);
    }

    // ── Weekly chart ──
    const weekSection = document.createElement('div');
    weekSection.className = 'stats-panel-section';
    const weekLabel = document.createElement('div');
    weekLabel.className = 'stats-panel-label';
    weekLabel.textContent = 'This week';
    weekSection.appendChild(weekLabel);

    const bars = computeWeekBars(pinned);
    const maxPct = Math.max(...bars.map(b => b.pct), 0.01);

    const barsEl = document.createElement('div');
    barsEl.className = 'stats-week-bars';
    const labelsEl = document.createElement('div');
    labelsEl.className = 'stats-week-labels';

    for (const bar of bars) {
        const b = document.createElement('div');
        b.className = 'stats-week-bar' + (bar.isToday ? ' today-bar' : '');
        b.style.height = Math.max(bar.pct / maxPct * 100, bar.pct > 0 ? 8 : 3) + '%';
        b.title = Math.round(bar.pct * 100) + '%';
        barsEl.appendChild(b);

        const l = document.createElement('div');
        l.className = 'stats-week-lbl' + (bar.isToday ? ' today-lbl' : '');
        l.textContent = bar.label;
        labelsEl.appendChild(l);
    }

    weekSection.appendChild(barsEl);
    weekSection.appendChild(labelsEl);
    panel.appendChild(weekSection);
}
```

- [ ] **Step 4.2: Call `renderStatsPanel()` from `render()`**

Find the `render()` function. After the existing `recalcProgress()` call at the top of the function, add:

```javascript
    renderStatsPanel();
```

- [ ] **Step 4.3: Smoke test**

Hard-refresh `http://localhost:8765/today`. Verify:
- Right column shows three cards: Done, Left, % Complete
- Habit streaks section lists each pinned habit with a streak count
- Weekly chart shows 7 bars with today's bar at full opacity
- Numbers update when you check/uncheck a habit

- [ ] **Step 4.4: Commit**

```bash
git add beaverhabits/static/js/today.js
git commit -m "feat: Today tab stats panel — progress, streaks, weekly chart"
```

---

## Task 5: Task deletion — swipe (mobile) + hover ✕ (desktop)

**Files:**
- Modify: `beaverhabits/static/js/today.js`

- [ ] **Step 5.1: Add `deleteTask` function**

After the `toggleTask` function, add:

```javascript
function deleteTask(id, wrapEl) {
    taskItems = taskItems.filter(t => t.id !== id);
    saveTasks();
    // Animate out before full re-render
    wrapEl.style.transition = 'opacity .18s';
    wrapEl.style.opacity = '0';
    setTimeout(render, 200);
}
```

- [ ] **Step 5.2: Add `attachSwipe` helper**

After `deleteTask`, add:

```javascript
function attachSwipe(wrap, inner, delBtn, onDelete) {
    const OPEN_W = 60, SNAP_AT = 30;
    let startX = 0, offsetX = 0, isOpen = false, dragging = false;

    inner.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        offsetX = isOpen ? -OPEN_W : 0;
        dragging = false;
        inner.classList.remove('swipe-snap');
    }, { passive: true });

    inner.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        if (!dragging && Math.abs(dx) < 5) return;
        dragging = true;
        const next = Math.min(0, Math.max(-OPEN_W, offsetX + dx));
        inner.style.transform = `translateX(${next}px)`;
    }, { passive: true });

    inner.addEventListener('touchend', e => {
        if (!dragging) return;
        const dx = e.changedTouches[0].clientX - startX;
        inner.classList.add('swipe-snap');
        if (!isOpen && dx < -SNAP_AT) {
            inner.style.transform = `translateX(${-OPEN_W}px)`;
            isOpen = true;
        } else {
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    });

    // Close on tap outside
    document.addEventListener('touchstart', e => {
        if (isOpen && !wrap.contains(e.target)) {
            inner.classList.add('swipe-snap');
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    }, { passive: true });

    delBtn.addEventListener('click', () => {
        inner.classList.add('swipe-snap');
        inner.style.transform = 'translateX(0)';
        isOpen = false;
        onDelete();
    });
}
```

- [ ] **Step 5.3: Rewrite `makeTaskRow` to use swipe wrap**

Find and replace the entire `makeTaskRow` function:

```javascript
function makeTaskRow(t, isPast) {
    const wrap = document.createElement('div');
    wrap.className = 'today-task-wrap';
    wrap.dataset.taskId = t.id;

    // Hidden delete button (revealed by swipe)
    const delBtn = document.createElement('div');
    delBtn.className = 'today-task-del';
    delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    wrap.appendChild(delBtn);

    const row = document.createElement('div');
    row.className = 'today-row today-task-inner';

    row.innerHTML = `
        <span class="today-drag">⠿</span>
        <div class="today-check${t.done ? ' done' : ''}"></div>
        <span class="today-name${t.done ? ' done' : ''}">${escHtml(t.text)}</span>
        ${t.carriedFrom ? `<span class="today-badge carryover">↑ yesterday</span>` : ''}
        ${!isPast ? `<button class="today-task-x" title="Delete task">✕</button>` : ''}
    `;

    if (!isPast) {
        row.addEventListener('click', e => {
            if (e.target.closest('.today-task-x')) return;
            toggleTask(t.id);
        });
        row.querySelector('.today-task-x')?.addEventListener('click', e => {
            e.stopPropagation();
            deleteTask(t.id, wrap);
        });
        // Mobile swipe
        if (window.matchMedia('(hover: none)').matches) {
            attachSwipe(wrap, row, delBtn, () => deleteTask(t.id, wrap));
        }
    } else {
        row.addEventListener('click', () => toggleTask(t.id));
    }

    wrap.appendChild(row);
    return wrap;
}
```

- [ ] **Step 5.4: Smoke test**

Hard-refresh `http://localhost:8765/today`. Add a task. Then:

**Desktop:** Hover the task row — a faint red ✕ appears on the right. Click it — task disappears with fade animation.

**Mobile / DevTools touch simulation:** Enable touch in DevTools (toggle device toolbar). Drag a task row left — trash button slides in from right. Drag far enough → snaps open. Tap trash → task deleted. Tap elsewhere → row snaps closed.

Verify carried-over tasks also get the delete affordance.

- [ ] **Step 5.5: Commit**

```bash
git add beaverhabits/static/js/today.js
git commit -m "feat: task deletion — swipe on mobile, hover X on desktop"
```

---

## Task 6: Habits page — swipe to archive/delete (mobile)

**Files:**
- Modify: `beaverhabits/static/css/styles.css`
- Modify: `beaverhabits/static/js/habits.js`

- [ ] **Step 6.1: Add habit swipe CSS**

At the end of `styles.css` (before the final closing comment if any), add:

```css
/* ── Habit row swipe (mobile) ────────────────────────────────── */
.hrow-wrap {
    position: relative; border-radius: var(--radius, 10px); overflow: hidden;
    margin-bottom: 2px;
}
.hrow-swipe-btns {
    position: absolute; right: 0; top: 0; bottom: 0;
    display: flex; border-radius: 0 var(--radius, 10px) var(--radius, 10px) 0; overflow: hidden;
}
.hrow-swipe-btn {
    width: 60px; display: flex; align-items: center; justify-content: center;
    cursor: pointer;
}
.hrow-swipe-btn.archive { background: #b45309; }
.hrow-swipe-btn.delete  { background: #b91c1c; }
.hrow-swipe-inner {
    position: relative; z-index: 1; background: var(--bg-surface);
    border-radius: var(--radius, 10px); will-change: transform;
}
.hrow-swipe-inner.swipe-snap {
    transition: transform .2s cubic-bezier(.25,.46,.45,.94);
}
/* Confirm-delete inline banner */
.hrow-delete-confirm {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; background: #7f1d1d;
    font-size: 12px; color: #fca5a5;
    border-radius: 0 0 var(--radius, 10px) var(--radius, 10px);
}
.hrow-delete-confirm button {
    padding: 4px 10px; border-radius: 5px; border: none; cursor: pointer;
    font-size: 11px; font-weight: 700;
}
.hrow-confirm-yes { background: #ef4444; color: white; }
.hrow-confirm-no  { background: #3f3f46; color: #d4d4d8; }
```

- [ ] **Step 6.2: Add `attachHabitSwipe` helper to habits.js**

Open `habits.js`. After the `buildSubgoalRow` function definition, add:

```javascript
// ── Mobile swipe: archive / delete ────────────────────────────
function attachHabitSwipe(wrap, inner, archBtn, delBtn, habit) {
    const OPEN_W = 120, SNAP_AT = 48;
    let startX = 0, offsetX = 0, isOpen = false, dragging = false;

    inner.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        offsetX = isOpen ? -OPEN_W : 0;
        dragging = false;
        inner.classList.remove('swipe-snap');
    }, { passive: true });

    inner.addEventListener('touchmove', e => {
        const dx = e.touches[0].clientX - startX;
        if (!dragging && Math.abs(dx) < 5) return;
        dragging = true;
        const next = Math.min(0, Math.max(-OPEN_W, offsetX + dx));
        inner.style.transform = `translateX(${next}px)`;
    }, { passive: true });

    inner.addEventListener('touchend', e => {
        if (!dragging) return;
        const dx = e.changedTouches[0].clientX - startX;
        inner.classList.add('swipe-snap');
        if (!isOpen && dx < -SNAP_AT) {
            inner.style.transform = `translateX(${-OPEN_W}px)`;
            isOpen = true;
        } else {
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    });

    document.addEventListener('touchstart', e => {
        if (isOpen && !wrap.contains(e.target)) {
            inner.classList.add('swipe-snap');
            inner.style.transform = 'translateX(0)';
            isOpen = false;
        }
    }, { passive: true });

    function closeSwipe() {
        inner.classList.add('swipe-snap');
        inner.style.transform = 'translateX(0)';
        isOpen = false;
    }

    archBtn.addEventListener('click', async () => {
        closeSwipe();
        try {
            await api.put(`/api/v1/habits/${habit.id}`, { status: 'archive' });
            allHabits = allHabits.filter(h => h.id !== habit.id);
            renderHabitList();
            toast('Habit archived');
        } catch (err) {
            toast(err.message || 'Failed to archive', 'error');
        }
    });

    delBtn.addEventListener('click', () => {
        closeSwipe();
        // Show inline confirmation banner below the row
        const confirm = document.createElement('div');
        confirm.className = 'hrow-delete-confirm';
        confirm.innerHTML = `
            <span style="flex:1">Delete "${escapeHtml(habit.name)}" permanently?</span>
            <button class="hrow-confirm-yes">Delete</button>
            <button class="hrow-confirm-no">Cancel</button>
        `;
        wrap.appendChild(confirm);

        confirm.querySelector('.hrow-confirm-yes').addEventListener('click', async () => {
            try {
                await api.delete(`/api/v1/habits/${habit.id}`);
                allHabits = allHabits.filter(h => h.id !== habit.id);
                renderHabitList();
                toast('Habit deleted');
            } catch (err) {
                toast(err.message || 'Failed to delete', 'error');
                confirm.remove();
            }
        });
        confirm.querySelector('.hrow-confirm-no').addEventListener('click', () => confirm.remove());
    });
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
```

- [ ] **Step 6.3: Wrap `buildRegularRow` output**

Find `buildRegularRow`. It currently ends with:
```javascript
    row.append(handle, icon, body, toggle);
    row.addEventListener('click', () => selectHabit(h.id));
    return row;
```

Replace those last three lines with:

```javascript
    row.append(handle, icon, body, toggle);
    row.addEventListener('click', () => selectHabit(h.id));

    // Mobile swipe wrap
    if (window.matchMedia('(hover: none)').matches) {
        const wrap = document.createElement('div');
        wrap.className = 'hrow-wrap';
        row.classList.add('hrow-swipe-inner');

        const swipeBtns = document.createElement('div');
        swipeBtns.className = 'hrow-swipe-btns';

        const archBtn = document.createElement('div');
        archBtn.className = 'hrow-swipe-btn archive';
        archBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;

        const delBtn = document.createElement('div');
        delBtn.className = 'hrow-swipe-btn delete';
        delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

        swipeBtns.append(archBtn, delBtn);
        wrap.append(swipeBtns, row);
        attachHabitSwipe(wrap, row, archBtn, delBtn, h);
        return wrap;
    }

    return row;
```

- [ ] **Step 6.4: Apply the same wrap to `buildSubgoalRow`**

Find `buildSubgoalRow`. It ends with (roughly):
```javascript
    row.append(handle, icon, body);
    row.addEventListener('click', () => selectHabit(h.id));
    return row;
```

Replace those last three lines with:

```javascript
    row.append(handle, icon, body);
    row.addEventListener('click', () => selectHabit(h.id));

    // Mobile swipe wrap (same as buildRegularRow)
    if (window.matchMedia('(hover: none)').matches) {
        const wrap = document.createElement('div');
        wrap.className = 'hrow-wrap';
        row.classList.add('hrow-swipe-inner');

        const swipeBtns = document.createElement('div');
        swipeBtns.className = 'hrow-swipe-btns';

        const archBtn = document.createElement('div');
        archBtn.className = 'hrow-swipe-btn archive';
        archBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`;

        const delBtn = document.createElement('div');
        delBtn.className = 'hrow-swipe-btn delete';
        delBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;

        swipeBtns.append(archBtn, delBtn);
        wrap.append(swipeBtns, row);
        attachHabitSwipe(wrap, row, archBtn, delBtn, h);
        return wrap;
    }

    return row;
```

- [ ] **Step 6.5: Smoke test**

Hard-refresh `http://localhost:8765/` (habits page). In DevTools, enable touch simulation.

Drag a habit row left — archive (amber) and delete (red) icons reveal. Tap archive — habit disappears, toast "Habit archived". Tap delete — confirmation banner slides in below the row with "Delete permanently?" and Yes/Cancel buttons.

Verify the habits page on desktop (non-touch) still looks identical to before — no swipe wrap added.

- [ ] **Step 6.6: Commit**

```bash
git add beaverhabits/static/js/habits.js beaverhabits/static/css/styles.css
git commit -m "feat: habit swipe to archive/delete on mobile"
```

---

## Task 7: Habits page — right-click context menu (desktop)

**Files:**
- Modify: `beaverhabits/static/css/styles.css`
- Modify: `beaverhabits/static/js/habits.js`

- [ ] **Step 7.1: Add context menu CSS**

Append to `styles.css`:

```css
/* ── Right-click context menu ────────────────────────────────── */
.ctx-menu {
    position: fixed; z-index: 9999;
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: 10px; padding: 5px 0; min-width: 160px;
    box-shadow: 0 8px 32px rgba(0,0,0,.4);
    display: none;
}
.ctx-menu.open { display: block; }
.ctx-menu-item {
    display: flex; align-items: center; gap: 9px;
    padding: 9px 14px; font-size: 12px; cursor: pointer;
    transition: background .1s; border-radius: 6px; margin: 1px 3px;
    color: var(--text-primary);
}
.ctx-menu-item:hover { background: var(--bg-elevated); }
.ctx-menu-item.danger { color: #ef4444; }
.ctx-menu-item.warn   { color: #f59e0b; }
.ctx-menu-sep { height: 1px; background: var(--border); margin: 3px 0; }
```

- [ ] **Step 7.2: Add context menu init to habits.js**

At the end of `habits.js`, before the `init()` call or the DOMContentLoaded handler, add:

```javascript
// ── Right-click context menu (desktop) ────────────────────────
let _ctxHabit = null;

function initContextMenu() {
    // Only attach on pointer (non-touch) devices
    if (!window.matchMedia('(hover: hover)').matches) return;

    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'habitCtxMenu';
    menu.innerHTML = `
        <div class="ctx-menu-item" id="ctxEdit">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit habit
        </div>
        <div class="ctx-menu-item warn" id="ctxArchive">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
            Archive
        </div>
        <div class="ctx-menu-sep"></div>
        <div class="ctx-menu-item danger" id="ctxDelete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
            Delete…
        </div>
    `;
    document.body.appendChild(menu);

    // Dismiss on outside click or Escape
    document.addEventListener('mousedown', e => {
        if (!menu.contains(e.target)) hideCtxMenu();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') hideCtxMenu();
    });

    // Actions
    menu.querySelector('#ctxEdit').addEventListener('click', () => {
        hideCtxMenu();
        if (_ctxHabit) openEditModal(_ctxHabit);
    });

    menu.querySelector('#ctxArchive').addEventListener('click', async () => {
        hideCtxMenu();
        if (!_ctxHabit) return;
        try {
            await api.put(`/api/v1/habits/${_ctxHabit.id}`, { status: 'archive' });
            allHabits = allHabits.filter(h => h.id !== _ctxHabit.id);
            renderHabitList();
            toast('Habit archived');
        } catch (err) {
            toast(err.message || 'Failed to archive', 'error');
        }
    });

    menu.querySelector('#ctxDelete').addEventListener('click', () => {
        hideCtxMenu();
        if (!_ctxHabit) return;
        const confirmed = window.confirm(`Delete "${_ctxHabit.name}" permanently? This cannot be undone.`);
        if (!confirmed) return;
        api.delete(`/api/v1/habits/${_ctxHabit.id}`)
            .then(() => {
                allHabits = allHabits.filter(h => h.id !== _ctxHabit.id);
                renderHabitList();
                toast('Habit deleted');
            })
            .catch(err => toast(err.message || 'Failed to delete', 'error'));
    });
}

function showCtxMenu(e, habit) {
    e.preventDefault();
    _ctxHabit = habit;
    const menu = document.getElementById('habitCtxMenu');
    if (!menu) return;
    // Position at cursor, keeping within viewport
    const vw = window.innerWidth, vh = window.innerHeight;
    const mw = 170, mh = 130;
    let x = e.clientX, y = e.clientY;
    if (x + mw > vw) x = vw - mw - 8;
    if (y + mh > vh) y = vh - mh - 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
    menu.classList.add('open');
}

function hideCtxMenu() {
    document.getElementById('habitCtxMenu')?.classList.remove('open');
    _ctxHabit = null;
}
```

- [ ] **Step 7.3: Find `openEditModal` reference**

Search for the function that opens the habit edit modal:

```bash
grep -n "openEditModal\|editModal\|habit-modal\|openHabitModal\|edit.*modal\|modal.*edit" "/home/mhamida/Desktop/Projects/Software Dev/habitlab/beaverhabits/static/js/habits.js" | head -10
```

Note the exact function name. If it is not `openEditModal`, update the `ctxEdit` handler in Step 7.2 to use the correct name. If the edit modal is opened by clicking a specific button (e.g. `#detailMore`), simulate that click instead:

```javascript
// If there's no openEditModal function, simulate the edit button click:
document.getElementById('detailMore')?.click();
```

- [ ] **Step 7.4: Attach context menu to habit rows**

In `buildRegularRow`, find the line:
```javascript
    row.addEventListener('click', () => selectHabit(h.id));
```

After it, add:
```javascript
    row.addEventListener('contextmenu', e => showCtxMenu(e, h));
```

In `buildSubgoalRow`, find the same pattern and add the same line after it.

- [ ] **Step 7.5: Call `initContextMenu()` from init**

Find where `renderHabitList()` is first called on page load (inside a `DOMContentLoaded` listener or similar init block). Add `initContextMenu()` alongside the other init calls. For example:

```javascript
    initContextMenu();
```

- [ ] **Step 7.6: Smoke test**

Hard-refresh `http://localhost:8765/`. Right-click any habit row. Verify:
- Custom context menu appears at cursor position (not the browser default menu)
- Menu stays within viewport if right-clicking near an edge
- Click "Edit habit" → opens the habit edit modal
- Click "Archive" → habit disappears from list, toast shows
- Click "Delete…" → browser confirm dialog, then habit removed
- Click anywhere outside menu → menu dismisses
- Press Escape → menu dismisses

- [ ] **Step 7.7: Commit**

```bash
git add beaverhabits/static/js/habits.js beaverhabits/static/css/styles.css
git commit -m "feat: right-click context menu on habits page — edit, archive, delete"
```

---

## Task 8: Final check + push

- [ ] **Step 8.1: Run full test suite**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
.venv/bin/pytest --tb=short -q
```

Expected: all tests pass, no regressions.

- [ ] **Step 8.2: End-to-end smoke test checklist**

Open `http://localhost:8765` and verify:

| Page | Check |
|------|-------|
| `/today` | Habit icons show in rows and pin section |
| `/today` | Two columns visible on desktop; right col hidden on mobile |
| `/today` | Stats panel: progress cards, streaks, week bars |
| `/today` | Add a task → hover → ✕ appears → click → task gone |
| `/today` (touch sim) | Drag task left → trash reveals → tap → task gone |
| `/today` | Day nav (prev/next) still works; past days read-only |
| `/today` | Sub-goal expansion still works |
| `/` | Right-click habit → context menu appears |
| `/` (touch sim) | Drag habit left → archive+delete icons reveal |
| `/` | Archive from context menu removes habit from list |
| `/` | Delete from context menu shows confirm, then removes |
| `/` | Drag-to-reorder habits still works |

- [ ] **Step 8.3: Merge feature/today-tab into main**

```bash
cd "/home/mhamida/Desktop/Projects/Software Dev/habitlab"
git checkout main
git merge feature/today-tab --no-ff -m "feat: Today tab — icons, task delete, two-column layout, habits swipe/context menu"
```

- [ ] **Step 8.4: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 8.5: Send ntfy notification**

```bash
curl -s -H 'Title: HabitLab' -d 'ALL DONE: TODAY TAB POLISH COMPLETE — ICONS, TASK DELETE, TWO-COLUMN LAYOUT, HABIT SWIPE+CONTEXT MENU, PUSHED TO MAIN.' ntfy.sh/mjlabclaude
```
