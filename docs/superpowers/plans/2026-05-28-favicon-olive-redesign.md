# Favicon Olive Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the purple (`#7c3aed`) favicon and all PWA icon PNGs with olive (`#4a7259`), matching the sage theme accent.

**Architecture:** Two steps — edit the SVG source in place, then run a one-off Python script to delete the old PNGs and regenerate them from the updated SVG. The script is committed to `tools/` for future reuse.

**Tech Stack:** Python + cairosvg (available via `uv run`), plain SVG editing.

---

## Files

| File | Change |
|---|---|
| `beaverhabits/static/favicon.svg` | Replace all `#7c3aed` → `#4a7259` |
| `tools/generate_icons.py` | Create — renders favicon.svg to all 7 PNG sizes |
| `beaverhabits/static/favicon-16.png` | Deleted and regenerated |
| `beaverhabits/static/favicon-32.png` | Deleted and regenerated |
| `beaverhabits/static/apple-touch-icon.png` | Deleted and regenerated |
| `beaverhabits/static/icon-192.png` | Deleted and regenerated |
| `beaverhabits/static/icon-192-maskable.png` | Deleted and regenerated |
| `beaverhabits/static/icon-512.png` | Deleted and regenerated |
| `beaverhabits/static/icon-512-maskable.png` | Deleted and regenerated |

---

### Task 1: Update favicon.svg

**Files:**
- Modify: `beaverhabits/static/favicon.svg`

- [ ] **Step 1: Verify current state**

```bash
grep -o '#7c3aed' beaverhabits/static/favicon.svg | wc -l
```

Expected output: `10` (8 rect fills + 1 circle fill + 1 stroke)

- [ ] **Step 2: Replace all occurrences**

```bash
sed -i 's/#7c3aed/#4a7259/g' beaverhabits/static/favicon.svg
```

- [ ] **Step 3: Verify no purple remains**

```bash
grep '#7c3aed' beaverhabits/static/favicon.svg && echo "FAIL: purple still present" || echo "OK: no purple found"
```

Expected output: `OK: no purple found`

- [ ] **Step 4: Verify olive is present**

```bash
grep -o '#4a7259' beaverhabits/static/favicon.svg | wc -l
```

Expected output: `10`

- [ ] **Step 5: Commit**

```bash
git add beaverhabits/static/favicon.svg
git commit -m "feat: update favicon color from purple to olive (#4a7259)"
```

---

### Task 2: Create icon generation script and regenerate all PNGs

**Files:**
- Create: `tools/generate_icons.py`
- Modify: all 7 PNGs in `beaverhabits/static/`

- [ ] **Step 1: Create the tools directory**

```bash
mkdir -p tools
```

- [ ] **Step 2: Create `tools/generate_icons.py`**

```python
#!/usr/bin/env python3
"""Regenerate all favicon and PWA icon PNGs from favicon.svg.

Run with: uv run python tools/generate_icons.py
Requires: cairosvg (uv pip install cairosvg)
"""
from pathlib import Path

import cairosvg

STATIC = Path(__file__).parent.parent / "beaverhabits" / "static"
SVG = STATIC / "favicon.svg"

ICONS = [
    ("favicon-16.png", 16),
    ("favicon-32.png", 32),
    ("apple-touch-icon.png", 180),
    ("icon-192.png", 192),
    ("icon-192-maskable.png", 192),
    ("icon-512.png", 512),
    ("icon-512-maskable.png", 512),
]

for filename, size in ICONS:
    out = STATIC / filename
    out.unlink(missing_ok=True)  # delete old file explicitly
    cairosvg.svg2png(url=str(SVG), write_to=str(out), output_width=size, output_height=size)
    print(f"  {filename} ({size}x{size}) — {out.stat().st_size:,} bytes")

print("Done.")
```

- [ ] **Step 3: Run the script**

```bash
uv run python tools/generate_icons.py
```

Expected output (sizes will vary slightly):
```
  favicon-16.png (16x16) — 412 bytes
  favicon-32.png (32x32) — 756 bytes
  apple-touch-icon.png (180x180) — 3,204 bytes
  icon-192.png (192x192) — 3,401 bytes
  icon-192-maskable.png (192x192) — 3,401 bytes
  icon-512.png (512x512) — 7,892 bytes
  icon-512-maskable.png (512x512) — 7,892 bytes
Done.
```

- [ ] **Step 4: Verify all 7 PNGs exist and are non-empty**

```bash
ls -lh beaverhabits/static/favicon-16.png \
        beaverhabits/static/favicon-32.png \
        beaverhabits/static/apple-touch-icon.png \
        beaverhabits/static/icon-192.png \
        beaverhabits/static/icon-192-maskable.png \
        beaverhabits/static/icon-512.png \
        beaverhabits/static/icon-512-maskable.png
```

Expected: all 7 files listed with size > 0.

- [ ] **Step 5: Commit**

```bash
git add tools/generate_icons.py \
        beaverhabits/static/favicon-16.png \
        beaverhabits/static/favicon-32.png \
        beaverhabits/static/apple-touch-icon.png \
        beaverhabits/static/icon-192.png \
        beaverhabits/static/icon-192-maskable.png \
        beaverhabits/static/icon-512.png \
        beaverhabits/static/icon-512-maskable.png
git commit -m "feat: regenerate all PWA icons in olive (#4a7259)"
```
