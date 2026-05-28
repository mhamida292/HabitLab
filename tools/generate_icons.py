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
