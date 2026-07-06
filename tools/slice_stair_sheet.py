#!/usr/bin/env python3
"""Découpe planche escaliers 6×2 (128×128) → assets/tiles/stairs/stair_XX.png."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "tiles" / "stairs"
SHEET_OUT = OUT_DIR / "stair_sheet.png"
CELL = 128
COLS = 6
ROWS = 2


def _key_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12 or (r < 28 and g < 28 and b < 28):
                px[x, y] = (0, 0, 0, 0)
    return im


def slice_stairs(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    names: list[str] = []
    idx = 0
    for row in range(ROWS):
        for col in range(COLS):
            x0, y0 = col * CELL, row * CELL
            cell = _key_black(im.crop((x0, y0, x0 + CELL, y0 + CELL)))
            name = f"stair_{idx:02d}.png"
            cell.save(OUT_DIR / name, optimize=True)
            names.append(name)
            print(f"  {name} ({cell.size[0]}x{cell.size[1]})")
            idx += 1
    return names


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SHEET_OUT.resolve():
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT} ({COLS}x{ROWS} @ {CELL}px)")
    names = slice_stairs(SHEET_OUT)
    print(f"OK ({len(names)} sprites)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
