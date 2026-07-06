#!/usr/bin/env python3
"""Découpe planche rochers colline 64×64 → assets/iso_nature/hill_rock_XX.png."""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "iso_nature"
SHEET_OUT = OUT_DIR / "hill_rock_sheet.png"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=1"

# Grille 4+4+2 sur planche 64×64
ROCK_BOXES = [
    ("hill_rock_00.png", (0, 0, 15, 15)),
    ("hill_rock_01.png", (16, 0, 31, 15)),
    ("hill_rock_02.png", (32, 0, 47, 15)),
    ("hill_rock_03.png", (48, 0, 63, 15)),
    ("hill_rock_04.png", (0, 16, 15, 31)),
    ("hill_rock_05.png", (16, 16, 31, 31)),
    ("hill_rock_06.png", (32, 16, 47, 31)),
    ("hill_rock_07.png", (48, 16, 63, 31)),
    ("hill_rock_08.png", (0, 32, 31, 63)),
    ("hill_rock_09.png", (32, 32, 63, 63)),
]

WEIGHTS = [1.0, 0.88, 0.92, 0.88, 1.22, 1.18, 1.22, 1.18, 0.52, 0.48]
SIZE_MUL = [0.52, 0.52, 0.52, 0.52, 0.28, 0.26, 0.28, 0.26, 0.92, 0.90]


def _trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def slice_rocks(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    source_dir = OUT_DIR / "_source_hill_rocks"
    source_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for name, (x0, y0, x1, y1) in ROCK_BOXES:
        cell = _trim(im.crop((x0, y0, x1 + 1, y1 + 1)))
        cell.save(source_dir / name, optimize=True)
        cell.save(OUT_DIR / name, optimize=True)
        names.append(name)
        print(f"  {name} ({cell.size[0]}x{cell.size[1]})")
    return names


def patch_js(names: list[str]):
    text = JS_OUT.read_text(encoding="utf-8")
    rock_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in names]
    weight_lines = ",\n  ".join(str(w) for w in WEIGHTS[: len(names)])
    size_lines = ", ".join(str(s) for s in SIZE_MUL[: len(names)])

    if "const MEDITERRANEAN_HILL_ROCK_SPRITES" in text:
        text = re.sub(
            r"const MEDITERRANEAN_HILL_ROCK_SPRITES = \[[\s\S]*?\];",
            "const MEDITERRANEAN_HILL_ROCK_SPRITES = [\n" + "\n".join(rock_lines) + "\n];",
            text,
            count=1,
        )
        text = re.sub(
            r"const MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS = \[[\s\S]*?\];",
            f"const MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS = [\n  {weight_lines},\n];",
            text,
            count=1,
        )
        text = re.sub(
            r"const MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL = \[[\s\S]*?\];",
            f"const MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL = [{size_lines}];",
            text,
            count=1,
        )
    else:
        block = [
            "",
            "const MEDITERRANEAN_HILL_ROCK_SPRITES = [",
            *rock_lines,
            "];",
            "",
            "const MEDITERRANEAN_HILL_ROCK_VARIANT_WEIGHTS = [",
            f"  {weight_lines},",
            "];",
            "",
            f"const MEDITERRANEAN_HILL_ROCK_VARIANT_SIZE_MUL = [{size_lines}];",
            "",
        ]
        text = text.rstrip() + "\n" + "\n".join(block)

    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Mis a jour {JS_OUT} ({len(names)} rochers colline)")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SHEET_OUT.resolve():
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT}")
    names = slice_rocks(SHEET_OUT)
    patch_js(names)
    print(f"OK ({len(names)} rochers)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
