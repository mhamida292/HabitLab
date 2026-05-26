# Future Features

---

## FF-001 — Rich text / markup in notes

**Requested:** 2026-05-25  
**Priority:** Medium  

### What
Add formatting capability to the notes editor: bullet points, headings, bold, italic, font size.

### Recommended approach
**Quill.js** via CDN — 2 script tags, ~30 lines of JS. Stores content as HTML in the existing `body` text field (no schema change needed). Existing plain-text notes load fine as-is.

### Effort estimate
3–4 hours. Main work is theming the Quill toolbar to match the app's design tokens (Midnight, Paper, etc.).

### Notes
- DB `body` field is already a text blob — no migration needed
- Existing plain-text notes render correctly in a contenteditable div
- Theme-aware toolbar CSS is the fiddly part
