# Task Inline Edit — Design Spec

**Date:** 2026-05-28
**Scope:** Today tab (`today.js`, `styles.css`) — no backend changes required

---

## Goal

Allow users to edit task text directly in the Today tab list without leaving the page or opening a modal.

---

## Interaction Model

| Target | Action |
|---|---|
| Circle | Click → toggle done (moved from row-level) |
| Task text | Click → enter edit mode |
| Row background | No longer a toggle target |

---

## Edit State

When the user clicks task text:

1. The text `<span>` is replaced in-place with a `<input type="text">` pre-filled with `t.text` (raw text only — carried-from badge not included; it reappears after save/cancel).
2. The input is focused and all text is selected immediately.
3. **Enter** or **blur** → save if text is non-empty and changed; restore original if empty or unchanged (no delete).
4. **Escape** → cancel; restore original text span; no API call.
5. A `saved` flag on the closure prevents double-fire when Escape triggers both the keydown handler and the subsequent blur.

---

## New Function: `updateTaskText(id, newText)`

Lockbox pattern — consistent with all other mutations in `today.js`:

```js
async function updateTaskText(id, newText) {
    _inflight++;
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

Uses existing `PATCH /api/v1/tasks/{id}` endpoint — accepts `{ text }` alongside `{ done }`. No backend changes needed.

---

## `renderTaskList()` Changes

- Remove `row.addEventListener('click', ...)` (was row-level toggle).
- Add `circle.addEventListener('click', e => { e.stopPropagation(); if (!busy) toggleTask(t.id); })`.
- Add `text.addEventListener('click', e => { e.stopPropagation(); if (!busy && viewDay >= TODAY) enterEditMode(t, text); })`.
- `text.style.cursor = 'text'` when not busy and `viewDay >= TODAY`; otherwise `default`.

---

## `enterEditMode(t, textSpan)` Function

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
            render(); // restore original
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

---

## CSS: `.tl-task-edit-input`

Seamless with the surrounding row — no visible border box, just a subtle accent underline while focused:

```css
.tl-task-edit-input {
    flex: 1;
    background: transparent;
    border: none;
    border-bottom: 1.5px solid var(--accent);
    border-radius: 0;
    padding: 0;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    min-width: 0;
}
```

---

## Files Changed

| File | Change |
|---|---|
| `beaverhabits/static/js/today.js` | Add `updateTaskText()`, add `enterEditMode()`, update `renderTaskList()` to split circle/text click handlers |
| `beaverhabits/static/css/styles.css` | Add `.tl-task-edit-input` rule |

---

## Out of Scope

- Editing habit names (separate flow via habit modal)
- Editing carried-from tasks on a past day (read-only mode already blocks this via `viewDay < TODAY` guard on the add row; edit mode should also be blocked for past days)
- Mobile swipe interaction (not affected — swipe targets the row wrapper, not the text span)
