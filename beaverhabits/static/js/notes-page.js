// beaverhabits/static/js/notes-page.js
import { api, toast } from '/static/js/api.js';
import { buildIconEl, applyIcons, isEmoji } from '/static/js/icons.js';

// ── Habit icon helpers ─────────────────────────────────────────────────────
// Build a styled pill span with proper icon (emoji or lucide SVG)
function makeHabitPill(habit) {
    const span = document.createElement('span');
    span.className = 'note-habit-pill';
    if (habit.icon) {
        if (isEmoji(habit.icon)) {
            span.appendChild(document.createTextNode(habit.icon + ' '));
        } else {
            const iconEl = buildIconEl(habit.icon, 11);
            iconEl.style.cssText = 'margin-right:3px;vertical-align:middle;opacity:.7';
            span.appendChild(iconEl);
        }
    }
    span.appendChild(document.createTextNode(habit.name));
    requestAnimationFrame(() => applyIcons());
    return span;
}

// Plain text label for <option> elements (no SVG allowed in options)
function habitOptionLabel(habit) {
    if (habit.icon && isEmoji(habit.icon)) return habit.icon + ' ' + habit.name;
    return habit.name;
}

// ── State ──────────────────────────────────────────────────────────────────
let state = {
    notes: [],       // all notes, newest-first
    habits: [],      // all habits (for filter chips + selector)
    selectedId: null,
    filterHabitId: null,
    view: localStorage.getItem('notes-view') || 'list',
};

// Auto-save debounce
let saveTimer = null;

// ── Context menu (desktop) ─────────────────────────────────────────────────
let _ctxNote = null;
let _notesCtxMenu = null;

function initContextMenu() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    _notesCtxMenu = document.createElement('div');
    _notesCtxMenu.className = 'ctx-menu';
    const delItem = document.createElement('div');
    delItem.className = 'ctx-menu-item danger';
    delItem.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg> Delete';
    delItem.addEventListener('click', () => {
        const note = _ctxNote;
        hideCtxMenu();
        if (note) deleteNote(note.id);
    });
    _notesCtxMenu.appendChild(delItem);
    document.body.appendChild(_notesCtxMenu);
    document.addEventListener('click', hideCtxMenu);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideCtxMenu(); });
}

function showCtxMenu(e, note) {
    if (!_notesCtxMenu) return;
    e.preventDefault();
    _ctxNote = note;
    const x = Math.min(e.clientX, window.innerWidth - 170);
    const y = Math.min(e.clientY, window.innerHeight - 60);
    _notesCtxMenu.style.left = x + 'px';
    _notesCtxMenu.style.top = y + 'px';
    _notesCtxMenu.classList.add('open');
}

function hideCtxMenu() {
    _notesCtxMenu?.classList.remove('open');
    _ctxNote = null;
}

// ── Init ───────────────────────────────────────────────────────────────────
async function init() {
    const params = new URLSearchParams(location.search);

    const [habitsData, notesData] = await Promise.all([
        api.get('/api/v1/habits'),
        api.get('/api/v1/notes'),
    ]).catch(() => {
        const main = document.getElementById('notesMain');
        if (main) main.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">Failed to load notes. Please refresh.</div>';
        return [[], []];
    });
    state.habits = habitsData;
    state.notes = notesData;

    // Process URL params before first render
    const noteId = params.get('id');
    if (noteId) {
        state.selectedId = noteId;
        setView('list', false);
        history.replaceState({}, '', '/notes');
    } else {
        setView(state.view, false);
    }

    // Single render
    renderFilters();
    renderMain();

    // Bind header buttons
    document.getElementById('notesNewBtn').addEventListener('click', () => createNote());
    document.getElementById('viewListBtn').addEventListener('click', () => setView('list'));
    document.getElementById('viewGridBtn').addEventListener('click', () => setView('grid'));
    initContextMenu();

    // Auto-create if ?new=1
    if (params.get('new') === '1') {
        const habitId = params.get('habit_id') || null;
        const date = params.get('date') || null;
        if (!noteId) { // don't create if we're opening an existing note
            await createNote(habitId, date);
            history.replaceState({}, '', '/notes');
        }
    }
}

// ── View toggle ────────────────────────────────────────────────────────────
function setView(v, render = true) {
    state.view = v;
    localStorage.setItem('notes-view', v);
    document.getElementById('viewListBtn').classList.toggle('active', v === 'list');
    document.getElementById('viewGridBtn').classList.toggle('active', v === 'grid');
    if (render) renderMain();
}

// ── Filter chips ───────────────────────────────────────────────────────────
function renderFilters() {
    const bar = document.getElementById('notesFilterBar');
    // Only show habits that have at least one linked note
    const linkedIds = new Set(state.notes.map(n => n.habit_id).filter(Boolean));
    const linkedHabits = state.habits.filter(h => linkedIds.has(h.id));

    bar.innerHTML = '';
    const allChip = el('button', { class: 'notes-chip' + (state.filterHabitId === null ? ' active' : ''), onclick: () => applyFilter(null) }, 'All');
    bar.appendChild(allChip);

    for (const h of linkedHabits) {
        const chip = el('button', {
            class: 'notes-chip' + (state.filterHabitId === h.id ? ' active' : ''),
            onclick: () => applyFilter(h.id),
        });
        if (h.icon && !isEmoji(h.icon)) {
            const iconEl = buildIconEl(h.icon, 11);
            iconEl.style.cssText = 'margin-right:3px;vertical-align:middle;opacity:.7';
            chip.appendChild(iconEl);
        } else if (h.icon) {
            chip.appendChild(document.createTextNode(h.icon + ' '));
        }
        chip.appendChild(document.createTextNode(h.name));
        bar.appendChild(chip);
    }
    requestAnimationFrame(() => applyIcons());
}

function applyFilter(habitId) {
    state.filterHabitId = habitId;
    state.selectedId = null;
    renderFilters();
    renderMain();
}

// ── Filtered notes ─────────────────────────────────────────────────────────
function filteredNotes() {
    if (!state.filterHabitId) return state.notes;
    return state.notes.filter(n => n.habit_id === state.filterHabitId);
}

// ── Main render ────────────────────────────────────────────────────────────
function renderMain() {
    const main = document.getElementById('notesMain');
    main.innerHTML = '';

    if (state.view === 'list') {
        renderListView(main);
    } else {
        renderGridView(main);
    }
}

// ── List view ──────────────────────────────────────────────────────────────
function renderListView(container) {
    const notes = filteredNotes();
    const split = el('div', { class: 'notes-list-split' });

    // Left: list
    const listCol = el('div', { class: 'notes-list-col', id: 'notesListCol' });
    if (notes.length === 0) {
        listCol.appendChild(el('div', { style: 'padding:20px;color:var(--text-muted);font-size:12px;text-align:center' }, 'No notes yet'));
    } else {
        for (const note of notes) {
            listCol.appendChild(makeListItem(note));
        }
    }
    split.appendChild(listCol);

    // Right: editor
    const editorCol = el('div', { class: 'notes-editor-col', id: 'notesEditorCol' });
    const selected = notes.find(n => n.id === state.selectedId);
    if (selected) {
        renderEditor(editorCol, selected);
    } else {
        editorCol.appendChild(el('div', { class: 'notes-editor-empty' }, 'Select a note or create one'));
    }
    split.appendChild(editorCol);
    container.appendChild(split);
}

function makeListItem(note) {
    const habit = state.habits.find(h => h.id === note.habit_id);
    const item = el('div', {
        class: 'note-list-item' + (note.id === state.selectedId ? ' selected' : ''),
        onclick: () => selectNote(note.id),
    });
    item.appendChild(el('div', { class: 'note-list-title' }, note.title || 'Untitled'));
    const meta = el('div', { class: 'note-list-meta' });
    if (habit) meta.appendChild(makeHabitPill(habit));
    meta.appendChild(el('span', { class: 'note-list-date' }, fmtDate(note.created_at)));
    item.appendChild(meta);
    if (note.body) item.appendChild(el('div', { class: 'note-list-preview' }, note.body));

    // Desktop: right-click context menu
    item.addEventListener('contextmenu', e => showCtxMenu(e, note));

    // Mobile: swipe left to reveal delete
    if (window.matchMedia('(hover: none)').matches) {
        const wrap = el('div', { class: 'note-list-item-wrap' });
        const delBtn = el('div', { class: 'note-swipe-del' });
        delBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
        delBtn.addEventListener('click', () => deleteNote(note.id));
        wrap.appendChild(delBtn);

        let startX = 0, startY = 0, tx = 0, locked = false;
        const SNAP = 72;
        item.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            tx = 0; locked = false;
            item.classList.remove('swipe-snap');
        }, { passive: true });
        item.addEventListener('touchmove', e => {
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            if (!locked && Math.abs(dy) > Math.abs(dx)) return;
            locked = true;
            tx = Math.max(-SNAP, Math.min(0, dx));
            item.style.transform = `translateX(${tx}px)`;
        }, { passive: true });
        item.addEventListener('touchend', () => {
            item.classList.add('swipe-snap');
            item.style.transform = tx < -SNAP / 2 ? `translateX(-${SNAP}px)` : '';
        });

        wrap.appendChild(item);
        return wrap;
    }

    return item;
}

function selectNote(id) {
    state.selectedId = id;
    renderMain();
    // On mobile: slide editor in over list (same pattern as habits detail panel)
    if (window.innerWidth <= 767) {
        requestAnimationFrame(() => {
            const editorCol = document.getElementById('notesEditorCol');
            if (editorCol) editorCol.classList.add('mobile-show');
        });
    }
}

// ── Editor ─────────────────────────────────────────────────────────────────
function renderEditor(container, note) {
    container.innerHTML = '';

    // Header
    const header = el('div', { class: 'note-editor-header' });
    const titleInput = el('input', {
        class: 'note-editor-title',
        type: 'text',
        placeholder: 'Untitled',
    });
    titleInput.value = note.title;
    titleInput.addEventListener('input', () => scheduleSave(note.id, { title: titleInput.value }));
    header.appendChild(titleInput);

    container.appendChild(header);

    // Meta bar
    const meta = el('div', { class: 'note-editor-meta' });
    meta.appendChild(el('span', {}, '📅 ' + fmtDate(note.created_at)));

    const habitSel = el('select', { class: 'note-habit-select' });
    const noneOpt = el('option', { value: '' }, 'No habit');
    if (!note.habit_id) noneOpt.selected = true;
    habitSel.appendChild(noneOpt);
    for (const h of state.habits) {
        const opt = el('option', { value: h.id }, habitOptionLabel(h));
        if (h.id === note.habit_id) opt.selected = true;
        habitSel.appendChild(opt);
    }
    habitSel.addEventListener('change', () => scheduleSave(note.id, { habit_id: habitSel.value }));
    meta.appendChild(habitSel);
    container.appendChild(meta);

    // Body
    const body = el('textarea', {
        class: 'note-editor-body',
        placeholder: 'Write something...',
    });
    body.value = note.body || '';
    body.addEventListener('input', () => scheduleSave(note.id, { body: body.value }));
    container.appendChild(body);

    // Back button — shown on mobile via CSS, slides editor out before re-rendering
    const backBtn = document.createElement('button');
    backBtn.className = 'note-back-btn';
    backBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>Notes';
    backBtn.addEventListener('click', () => {
        const editorCol = document.getElementById('notesEditorCol');
        if (editorCol) editorCol.classList.remove('mobile-show');
        setTimeout(() => {
            state.selectedId = null;
            renderMain();
        }, 250);
    });
    container.insertBefore(backBtn, container.firstChild);
}

// ── Grid view ──────────────────────────────────────────────────────────────
function renderGridView(container) {
    const notes = filteredNotes();
    const grid = el('div', { class: 'notes-grid' });

    if (notes.length === 0) {
        const empty = el('div', { class: 'notes-empty', style: 'grid-column:1/-1' });
        empty.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>';
        empty.appendChild(el('p', {}, 'No notes yet'));
        grid.appendChild(empty);
    } else {
        for (const note of notes) {
            grid.appendChild(makeCard(note));
        }
    }

    // Add card
    const addCard = el('button', { class: 'note-card note-card-add', onclick: () => createNote() }, '+ New note');
    grid.appendChild(addCard);
    container.appendChild(grid);
}

function makeCard(note) {
    const habit = state.habits.find(h => h.id === note.habit_id);
    const card = el('div', { class: 'note-card', onclick: () => openCardEditor(note.id) });
    card.appendChild(el('div', { class: 'note-card-title' }, note.title || 'Untitled'));
    if (note.body) card.appendChild(el('div', { class: 'note-card-body' }, note.body));
    const foot = el('div', { class: 'note-card-footer' });
    foot.appendChild(el('span', { class: 'note-card-date' }, fmtDate(note.created_at)));
    if (habit) foot.appendChild(makeHabitPill(habit));
    card.appendChild(foot);
    card.addEventListener('contextmenu', e => showCtxMenu(e, note));
    return card;
}

function openCardEditor(id) {
    setView('list', false);
    state.selectedId = id;
    renderMain();
}

// ── CRUD ───────────────────────────────────────────────────────────────────
async function createNote(habitId = null, date = null) {
    try {
        const payload = { title: '', body: '', habit_id: habitId };
        if (date) payload.created_at = date + 'T00:00:00';
        const note = await api.post('/api/v1/notes', payload);
        state.notes.unshift(note);
        state.selectedId = note.id;
        if (state.view === 'grid') setView('list', false);
        renderFilters();
        renderMain();
        // Focus title for new note
        requestAnimationFrame(() => document.querySelector('.note-editor-title')?.focus());
    } catch (e) {
        toast('Failed to create note', 'error');
    }
}

function scheduleSave(noteId, patch) {
    const note = state.notes.find(n => n.id === noteId);
    if (note) Object.assign(note, patch);
    if (note && 'habit_id' in note) note.habit_id = note.habit_id || null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (!note) return;
        persistNote(noteId, {
            title: note.title,
            body: note.body,
            habit_id: note.habit_id,
        });
    }, 600);
}

async function persistNote(noteId, patch) {
    try {
        await api.put(`/api/v1/notes/${noteId}`, patch);
        renderFilters(); // habit filter chips may need to update
    } catch (e) {
        toast('Failed to save note', 'error');
    }
}

async function deleteNote(id) {
    try {
        await api.delete(`/api/v1/notes/${id}`);
        state.notes = state.notes.filter(n => n.id !== id);
        state.selectedId = null;
        renderFilters();
        renderMain();
        toast('Note deleted');
    } catch (e) {
        toast('Failed to delete note', 'error');
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────
function el(tag, attrs = {}, text = null) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'onclick') e.addEventListener('click', v);
        else if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k === 'id') e.id = v;
        else e.setAttribute(k, v);
    }
    if (text !== null) e.textContent = text;
    return e;
}

function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Bootstrap ──────────────────────────────────────────────────────────────
init().catch(console.error);
