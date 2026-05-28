# Task Inline Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users click a task's text in the Today tab to edit it inline — no modal, no extra UI.

**Architecture:** Pure frontend change. Move the row-level toggle click onto the circle element, add a text-click handler that swaps the span for a focused `<input>`, and a `updateTaskText()` Lockbox mutation that PATCHes the existing `/api/v1/tasks/{id}` endpoint.

**Tech Stack:** Vanilla JS ES modules, plain CSS custom properties. No new dependencies.

---

## Files

| File | Change |
|---|---|
| `beaverhabits/static/css/styles.css` | Add `.tl-task-edit-input` rule after the `.tl-task-name` block (~line 1341) |
| `beaverhabits/static/js/today.js` | Add `updateTaskText()`, add `enterEditMode()`, update `renderTaskList()` |

---

### Task 1: Add edit-input CSS rule

**Files:**
- Modify: `beaverhabits/static/css/styles.css` (after line 1341, end of `.tl-task-name` block)

- [ ] **Step 1: Add the CSS rule**

Open `beaverhabits/static/css/styles.css`. Find the `.tl-task-name` block (around line 1336):

```css
.tl-task-name {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-primary);
    word-break: break-word;
}
```

Insert the following immediately after that closing brace:

```css
.tl-task-edit-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--accent);
    border-radius: 0;
    padding: 0;
    color: var(--text-primary);
    font-size: 0.875rem;
    font-family: inherit;
    outline: none;
    min-width: 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add beaverhabits/static/css/styles.css
git commit -m "feat: add .tl-task-edit-input CSS for inline task editing"
```

---

### Task 2: Add `updateTaskText()` and `enterEditMode()` to today.js

**Files:**
- Modify: `beaverhabits/static/js/today.js`

- [ ] **Step 1: Add `updateTaskText()` after `deleteTask()`**

In `today.js`, find `deleteTask()` (ends around line 547). Insert the following function immediately after it:

```js
async function updateTaskText(id, newText) {
    _inflight++;
    render();
    try {
        const updated = await api.patch(`/api/v1/tasks/${id}`, { text: newText });
        taskItems.find(t => t.id === id).text = updated.text;
    } catch (err) {
        toast(err?.message || 'Failed to update task', 'error');
    } finally {
        _inflight--;
        render();
    }
}
```

- [ ] **Step 2: Add `enterEditMode()` after `updateTaskText()`**

Insert the following function immediately after `updateTaskText()`:

```js
function enterEditMode(t, textSpan) {
    if (_inflight > 0) return;
    let saved = false;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tl-task-edit-input';
    input.value = t.text;
    textSpan.replaceWith(input);
    input.focus();
    input.select();

    function save() {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== t.text) {
            updateTaskText(t.id, val);
        } else {
            render(); // restore original (empty or unchanged)
        }
    }

    function cancel() {
        if (saved) return;
        saved = true;
        render();
    }

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { cancel(); }
    });
    input.addEventListener('blur', save);
}
```

- [ ] **Step 3: Update `renderTaskList()` — split circle and text click handlers**

Find `renderTaskList()` in `today.js`. Replace the entire function body with the version below. Key changes: remove the row-level click handler, add circle click → toggle, add text click → `enterEditMode`.

```js
function renderTaskList() {
    const el = document.getElementById('todayList');
    if (!el) return;
    el.innerHTML = '';

    const busy = _inflight > 0;
    const editable = !busy && viewDay >= TODAY;

    taskItems.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tl-task-row' + (busy ? ' busy' : '') + (t.done ? ' done' : '');

        const handle = document.createElement('div');
        handle.className = 'tl-drag-handle';
        handle.textContent = '⠿';
        handle.addEventListener('click', e => e.stopPropagation());

        const circle = document.createElement('div');
        circle.className = 'tl-task-circle' + (t.done ? ' done' : '');
        if (t.done) circle.innerHTML = checkmarkSvg(11);
        circle.addEventListener('click', e => { e.stopPropagation(); if (!busy) toggleTask(t.id); });

        const text = document.createElement('span');
        text.className = 'tl-task-name';
        text.textContent = t.carriedFrom
            ? `${t.text} ↑ ${isoLabel(t.carriedFrom)}`
            : t.text;
        if (editable) {
            text.style.cursor = 'text';
            text.addEventListener('click', e => { e.stopPropagation(); enterEditMode(t, text); });
        }

        const delBtn = document.createElement('button');
        delBtn.className = 'tl-task-del';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', e => { e.stopPropagation(); deleteTask(t.id); });

        row.append(handle, circle, text, delBtn);
        el.appendChild(row);
    });
}
```

- [ ] **Step 4: Commit**

```bash
git add beaverhabits/static/js/today.js
git commit -m "feat: inline task text editing — click text to edit, circle to toggle"
```

---

### Task 3: Manual verification

**Files:** None (browser testing)

- [ ] **Step 1: Start the dev server**

```bash
uv run uvicorn beaverhabits.main:app --reload --port 8765
```

Open `http://localhost:8765`.

- [ ] **Step 2: Verify toggle still works**

Click the **circle** on any undone task. Confirm it toggles to done (strikethrough + filled circle). Click again — confirm it toggles back. The row background should NOT be a toggle target anymore.

- [ ] **Step 3: Verify edit mode opens**

Click on the **text** of any task. Confirm:
- Text is replaced by an `<input>` with the task text pre-filled
- Input is focused and text is selected
- A subtle accent underline appears on the input

- [ ] **Step 4: Verify save on Enter**

While editing, change the text and press Enter. Confirm:
- Input disappears, new text shows in the row
- No error toast

- [ ] **Step 5: Verify save on blur**

Open edit mode, change the text, click elsewhere on the page. Confirm the new text is saved.

- [ ] **Step 6: Verify cancel on Escape**

Open edit mode, change the text, press Escape. Confirm the original text is restored (no API call, no change).

- [ ] **Step 7: Verify empty text restores original**

Open edit mode, clear all text, press Enter. Confirm the original text is restored (not deleted, no error).

- [ ] **Step 8: Verify past-day read-only**

Navigate to a past day using the ← button. Confirm task text is NOT clickable into edit mode (cursor stays default, no input appears).

- [ ] **Step 9: Run backend tests**

```bash
uv run pytest tests/test_today_api.py -v
```

Expected: all tests pass (no backend changes were made, just confirming nothing regressed).
