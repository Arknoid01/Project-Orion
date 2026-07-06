#!/usr/bin/env python3
"""Découpe la planche iso nature 4×4 → assets/iso_nature/."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SHEET = ROOT / "assets" / "iso_nature" / "nature_sheet.png"
OUT_DIR = ROOT / "assets" / "iso_nature"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=1"

# Colonnes détectées sur la planche 700×917 (gouttières 1 px)
COL_BOXES = [(1, 172), (176, 347), (351, 522), (526, 697)]


def _row_boxes(height: int) -> list[tuple[int, int]]:
    quarter = height // 4
    return [(i * quarter, (i + 1) * quarter - 1 if i < 3 else height - 1) for i in range(4)]


def _trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def slice_sheet(sheet_path: Path) -> tuple[list[str], list[str]]:
    im = Image.open(sheet_path).convert("RGBA")
    row_boxes = _row_boxes(im.size[1])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    source_dir = OUT_DIR / "_source"
    source_dir.mkdir(parents=True, exist_ok=True)

    trees, props = [], []
    for row in range(4):
        y0, y1 = row_boxes[row]
        for col, (x0, x1) in enumerate(COL_BOXES):
            cell = _trim(im.crop((x0, y0, x1 + 1, y1 + 1)))
            idx = row * 4 + col
            if row < 2:
                name = f"iso_tree_{idx:02d}.png"
                trees.append(name)
            else:
                name = f"iso_prop_{idx - 8:02d}.png"
                props.append(name)
            cell.save(source_dir / name, optimize=True)
            print(f"  {name} ({cell.size[0]}x{cell.size[1]})")
    return trees, props


def write_js(trees: list[str], props: list[str]):
    tree_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in trees]
    prop_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in props]
    weights = ",\n  ".join("1" for _ in trees)
    js = [
        "// Genere par tools/slice_iso_nature_sheet.py — ne pas editer a la main.",
        "// Planche iso : lignes 0-1 = arbres, lignes 2-3 = herbes.",
        "const MEDITERRANEAN_TREE_SPRITES = [",
        *tree_lines,
        "];",
        "",
        "const MEDITERRANEAN_PROP_SPRITES = [",
        *prop_lines,
        "];",
        "",
        "const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = [",
        f"  {weights},",
        "];",
        "",
    ]
    JS_OUT.write_text("\n".join(js), encoding="utf-8")
    print(f"Ecrit {JS_OUT} ({len(trees)} arbres, {len(props)} herbes)")


def main():
    import sys

    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SHEET
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    if src.resolve() != DEFAULT_SHEET.resolve():
        DEFAULT_SHEET.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, DEFAULT_SHEET)
    print(f"Decoupe {DEFAULT_SHEET}")
    trees, props = slice_sheet(DEFAULT_SHEET)
    source_dir = OUT_DIR / "_source"
    for p in source_dir.glob("iso_*.png"):
        shutil.copy2(p, OUT_DIR / p.name)
    write_js(trees, props)
    print(f"OK ({len(trees) + len(props)} sprites, couleurs originales)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
