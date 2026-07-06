#!/usr/bin/env python3
"""Découpe la planche arbres peints → assets/iso_nature/tree_pack_XX.png."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "iso_nature"
SHEET_OUT = OUT_DIR / "tree_pack_sheet.png"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=6"

# Boîtes détectées sur la planche 700×450 (gouttières noires)
TREE_BOXES = [
    ("tree_pack_00.png", (24, 12, 132, 143)),   # feuillu large
    ("tree_pack_01.png", (150, 12, 247, 143)),  # feuillu moyen
    ("tree_pack_02.png", (271, 12, 358, 143)),  # feuillu petit
    ("tree_pack_03.png", (389, 12, 463, 143)),  # pin large
    ("tree_pack_04.png", (485, 12, 539, 143)),  # pin petit
    ("tree_pack_05.png", (24, 158, 132, 294)),  # mort large
    ("tree_pack_06.png", (150, 158, 247, 294)), # mort moyen
    ("tree_pack_07.png", (271, 158, 358, 294)), # mort petit
    ("tree_pack_08.png", (551, 158, 631, 294)), # palmier
    ("tree_pack_09.png", (24, 298, 132, 431)),  # palmier courbé
]

# Vivants favorisés ; morts très rares ; palmiers = sable uniquement
TREE_WEIGHTS = [1.35, 1.25, 1.15, 1.2, 1.0, 0.10, 0.08, 0.06, 0.85, 0.85]
TREE_FOREST_INDICES = [0, 1, 2, 5, 6, 7]  # pins 3-4 exclus
TREE_PALM_INDICES = [8, 9]


def _trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def slice_trees(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    source_dir = OUT_DIR / "_source_trees"
    source_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for name, (x0, y0, x1, y1) in TREE_BOXES:
        cell = _trim(im.crop((x0, y0, x1 + 1, y1 + 1)))
        cell.save(source_dir / name, optimize=True)
        cell.save(OUT_DIR / name, optimize=True)
        names.append(name)
        print(f"  {name} ({cell.size[0]}x{cell.size[1]})")
    return names


def _existing_prop_sprites() -> list[str]:
    props = sorted(OUT_DIR.glob("grass_prop_*.png"))
    if not props:
        props = sorted(OUT_DIR.glob("iso_prop_*.png"))
    if not props:
        return [
            "grass_prop_00.png", "grass_prop_01.png", "grass_prop_02.png",
            "grass_prop_03.png", "grass_prop_04.png", "grass_prop_05.png",
            "grass_prop_06.png", "grass_prop_07.png", "grass_prop_08.png",
            "grass_prop_09.png",
        ]
    return [p.name for p in props]


def write_js(tree_names: list[str], prop_names: list[str]):
    tree_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in tree_names]
    prop_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in prop_names]
    weights = ",\n  ".join(str(w) for w in TREE_WEIGHTS[: len(tree_names)])
    forest_idx = ", ".join(str(i) for i in TREE_FOREST_INDICES if i < len(tree_names))
    palm_idx = ", ".join(str(i) for i in TREE_PALM_INDICES if i < len(tree_names))
    js = [
        "// Genere par tools/slice_tree_pack_sheet.py — ne pas editer a la main.",
        "// Arbres : planche peinte tree_pack_sheet | Herbes : iso_prop_*",
        "const MEDITERRANEAN_TREE_SPRITES = [",
        *tree_lines,
        "];",
        "",
        "const MEDITERRANEAN_PROP_SPRITES = [",
        *prop_lines,
        "];",
        "",
        "// Indices : 0-4 vivants, 5-7 morts, 8-9 palmiers (sable uniquement)",
        f"const MEDITERRANEAN_TREE_FOREST_INDICES = [{forest_idx}];",
        f"const MEDITERRANEAN_TREE_PALM_INDICES = [{palm_idx}];",
        "",
        "const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = [",
        f"  {weights},",
        "];",
        "",
    ]
    JS_OUT.write_text("\n".join(js), encoding="utf-8")
    print(f"Ecrit {JS_OUT} ({len(tree_names)} arbres, {len(prop_names)} herbes)")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SHEET_OUT.resolve():
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT}")
    trees = slice_trees(SHEET_OUT)
    props = _existing_prop_sprites()
    write_js(trees, props)
    import subprocess
    subprocess.run([sys.executable, str(ROOT / "tools" / "soften_tree_pack.py")], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
