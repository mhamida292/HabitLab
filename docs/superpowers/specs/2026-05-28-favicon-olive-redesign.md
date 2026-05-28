# Favicon & Logo Color — Olive Redesign Spec

**Date:** 2026-05-28

---

## Goal

Replace the current purple (`#7c3aed`) favicon and PWA icon color with olive (`#4a7259`, the sage theme accent). Works on any background regardless of active theme.

---

## Color

| Property | Old | New |
|---|---|---|
| Dot fill | `#7c3aed` | `#4a7259` |
| Outline rect stroke | `#7c3aed` | `#4a7259` |
| Background rect | `#ffffff` | `#ffffff` (unchanged) |

---

## Files

### SVG (edit in place)

| File | Change |
|---|---|
| `beaverhabits/static/favicon.svg` | Replace all `#7c3aed` → `#4a7259` (8 rect fills + 1 circle fill + 1 stroke = 10 occurrences) |
| `beaverhabits/static/logo-mark.svg` | No change — uses `currentColor`, inherits from CSS |

### PNGs (delete old, regenerate from updated favicon.svg)

| File | Size | Notes |
|---|---|---|
| `beaverhabits/static/favicon-16.png` | 16×16 | Browser tab favicon |
| `beaverhabits/static/favicon-32.png` | 32×32 | Browser tab favicon (retina) |
| `beaverhabits/static/apple-touch-icon.png` | 180×180 | iOS homescreen |
| `beaverhabits/static/icon-192.png` | 192×192 | PWA Android icon |
| `beaverhabits/static/icon-192-maskable.png` | 192×192 | PWA maskable (safe zone covered by existing SVG padding) |
| `beaverhabits/static/icon-512.png` | 512×512 | PWA splash |
| `beaverhabits/static/icon-512-maskable.png` | 512×512 | PWA maskable splash |

All 7 PNGs are deleted and regenerated from the updated `favicon.svg` using `cairosvg` (available via `uv run`).

---

## Implementation Approach

A single Python script (`tools/generate_icons.py`) at the project root:

1. Reads `beaverhabits/static/favicon.svg`
2. Renders it to each required PNG size using `cairosvg.svg2png(url=..., output_width=N, output_height=N)`
3. Writes each PNG directly to `beaverhabits/static/`

Script is committed to the repo under `tools/` for future reuse (e.g. if the icon shape ever changes). It is a dev tool only — not imported by the app.

---

## Out of Scope

- Changing `logo-mark.svg` (already theme-aware via `currentColor`)
- Changing the favicon background color (stays white)
- Changing any theme accent colors in `styles.css`
- Updating `manifest.json` (already references the correct filenames)
