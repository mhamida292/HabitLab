# Notes App — Design Spec
**Date:** 2026-05-25  
**Status:** Approved  
**Related:** `2026-05-25-detail-panel-redesign.md`

---

## Problem

Notes currently exist as `text` fields on completion records — one note per day, only writable when you've checked in, no title, no browsability. There's no way to write a general journal entry, browse past notes, or link a note to a habit without also touching that day's completion.

---

## Solution Overview

First-class notes entity stored alongside habits in the existing JSON storage. A new **Notes page** in the sidebar nav with a list+editor split view and a card grid view, toggled by the user. Notes can optionally be linked to a habit. The detail panel's "Recent notes" section surfaces the last 2 notes for the selected habit.

---

## Data Model

Notes are stored as a top-level `"notes"` key in the user's habit list JSON (same file as `"habits"`):

```json
{
  "habits": [...],
  "notes": [
    {
      "id": "abc123",
      "title": "Felt amazing after run",
      "body": "Hit a new personal record — 7km without stopping...",
      "habit_id": "exercise-habit-id",
      "created_at": "2026-05-25T10:30:00"
    }
  ]
}
```

Fields:
- `id` — short hash (same generator as habit IDs)
- `title` — string, required, defaults to `"Untitled"` if blank on save
- `body` — string, optional, markdown-friendly plain text
- `habit_id` — string or null, optional link to a habit
- `created_at` — ISO datetime string, set on creation, never updated

---

## Backend — New Endpoints

All under `/api/v1/`:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/notes` | List all notes. Optional `?habit_id=` filter. Returns newest-first. |
| `POST` | `/notes` | Create a note. Body: `{ title, body?, habit_id? }` |
| `PUT` | `/notes/{id}` | Update title, body, habit_id. |
| `DELETE` | `/notes/{id}` | Delete a note. |

Storage changes:
- `DictHabitList` gets a `notes` property reading/writing `self.data.setdefault("notes", [])`
- No migration needed — missing `"notes"` key defaults to empty list

---

## Notes Page

### Navigation

New icon in the sidebar nav rail between Habits and Stats. Uses the Lucide `notebook-pen` icon (monochrome, consistent with existing icons).

Route: `/notes` (new page route in `pages.py`)  
Template: `beaverhabits/templates/notes.html`

### Layout — Desktop

Same three-panel shell as the habits page: nav rail + content area.

**Header bar** (spans full content area):
- Title: "Notes"
- View toggle: ☰ List / ⊞ Grid — two small icon buttons, active one has white pill background
- "+ New" button (blue, top right)

**Filter chips** (below header):
- "All" chip (default active)
- One chip per habit that has at least one linked note, showing the habit icon + name
- Chips are scrollable horizontally if many habits

**List + Editor view (default):**
- Left column (~200px): scrollable list of notes
  - Each row: title (bold), habit tag (green pill, if linked), date, preview text (1 line, truncated)
  - Selected row highlighted in blue
- Right column: inline editor
  - Title field (large, editable in place)
  - Metadata row: date + habit selector dropdown (shows all habits, or "No habit")
  - Body textarea (grows with content, plain text)
  - Delete button (red trash icon, top right of header)

**Grid / Cards view:**
- 3-column card grid (2 on narrow screens)
- Each card: title, body preview (2 lines), date + habit tag at bottom
- Last card in grid is always "+ New note" placeholder
- Clicking a card opens a slide-out drawer editor (same fields as list editor)

### Layout — Mobile

No split. Single scrollable column.

- Header + filter chips remain
- **List view**: full-width note rows; tapping opens note full-screen (back button returns)
- **Grid view**: 2-column card grid; tapping opens note full-screen
- View toggle persists (same localStorage key as desktop)

### Interactions

| Action | Behaviour |
|--------|-----------|
| Create note | Tapping "+ New" inserts a blank note at top of list/grid, immediately focuses title field |
| Save | Auto-save on blur (title or body field loses focus) — no explicit save button |
| Delete | Confirmation not required — note is removed immediately, undo toast shown for 4s |
| Filter by habit | Clicking a habit chip filters list/grid to notes linked to that habit |
| Link habit | Dropdown in editor metadata row; shows all active habits + "No habit" option |

### Empty State

When there are no notes (or no notes match the active filter):
- Centred icon + "No notes yet" + "Write your first note →" button

---

## Detail Panel Integration

The "Recent notes" section in the habit detail panel (see detail panel spec):
- Calls `GET /api/v1/notes?habit_id={id}` when a habit is selected
- Renders the last 2 notes (title + date)
- "+ Add note" navigates to `/notes` and immediately creates a new note pre-linked to that habit

---

## Files Changed

| File | Change |
|------|--------|
| `beaverhabits/storage/dict.py` | Add `notes` property to `DictHabitList` |
| `beaverhabits/routes/api.py` | Add 4 note CRUD endpoints |
| `beaverhabits/routes/pages.py` | Add `/notes` page route |
| `beaverhabits/templates/base.html` | Add notes icon to nav rail |
| `beaverhabits/templates/notes.html` | New template (extends base, notes page structure) |
| `beaverhabits/static/js/notes-page.js` | New — notes page logic (fetch, render, CRUD, view toggle) |
| `beaverhabits/static/css/styles.css` | Notes page styles, card grid, slide-out drawer, view toggle |
| `beaverhabits/static/js/habits.js` | Update `renderRecentNotes` to call notes API |

The existing `notes.js` (which handles the per-record text modal) remains untouched — it's still used for the old inline note editor on calendar taps.

---

## What Is Not Changing

- Existing per-record `text` field on completion records — kept as-is, still editable via calendar tap
- Existing `notes.js` modal — untouched
- All other pages and routes — untouched

---

## Success Criteria

- Notes page loads at `/notes` and is reachable from the sidebar
- Create, edit, delete a note — all persist across page reload
- Linking a note to a habit filters it correctly in the habit chip filter
- View toggle switches between list+editor and card grid; preference persists in localStorage
- Mobile: single column, note opens full-screen on tap
- Detail panel "Recent notes" shows last 2 notes for the selected habit with working "+ Add note"
