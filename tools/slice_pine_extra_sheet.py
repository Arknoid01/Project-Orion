#!/usr/bin/env python3
"""Découpe planche pins supplémentaire → tree_pack_10..13, intégration JS."""

from __future__ import annotations

import colorsys
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "iso_nature"
SHEET_OUT = OUT_DIR / "pine_extra_sheet.png"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=10"

# Planche 640×1024 — 4 pins en bas (vivant, mort, vivant, mort)
PINE_BOXES = [
    ("tree_pack_10.png", (2, 873, 63, 1012), "vivant large"),
    ("tree_pack_11.png", (70, 879, 127, 1012), "mort large"),
    ("tree_pack_12.png", (135, 904, 182, 1010), "vivant moyen"),
    ("tree_pack_13.png", (205, 907, 242, 1010), "mort moyen"),
]

# Poids : vivants normaux ; morts = même rareté que 05-07
NEW_WEIGHTS = [1.12, 0.10, 1.0, 0.08]
NEW_FOREST_INDICES = [10, 11, 12, 13]

GLOBAL_COLOR = 0.88
GLOBAL_CONTRAST = 0.96
GLOBAL_BRIGHTNESS = 0.98
PIXEL_SAT_MUL = 0.92
GREEN_HUE_SAT_MUL = 0.72
GREEN_HUE_RANGE = (0.14, 0.50)
SHADOW_LUM_MAX = 0.12
BLACK_KEY = 22


def _trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def _key_black(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r <= BLACK_KEY and g <= BLACK_KEY and b <= BLACK_KEY:
                px[x, y] = (0, 0, 0, 0)
    return im


def _pixel_soften(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a < 12:
        return 0, 0, 0, 0
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    if v <= SHADOW_LUM_MAX:
        return r, g, b, a
    sat_mul = PIXEL_SAT_MUL
    if GREEN_HUE_RANGE[0] <= h <= GREEN_HUE_RANGE[1] and s > 0.10:
        sat_mul *= GREEN_HUE_SAT_MUL
    s = max(0.0, min(1.0, s * sat_mul))
    nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
    return (
        min(255, int(nr * 255)),
        min(255, int(ng * 255)),
        min(255, int(nb * 255)),
        a,
    )


def _soften(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            px[x, y] = _pixel_soften(*px[x, y])
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(GLOBAL_COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(GLOBAL_CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(GLOBAL_BRIGHTNESS)
    return Image.merge("RGBA", (*rgb.split(), im.split()[3]))


def slice_pines(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    source_dir = OUT_DIR / "_source_trees"
    source_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for name, (x0, y0, x1, y1), label in PINE_BOXES:
        cell = _trim(_key_black(im.crop((x0, y0, x1 + 1, y1 + 1))))
        cell.save(source_dir / name, optimize=True)
        _soften(cell).save(OUT_DIR / name, optimize=True)
        names.append(name)
        print(f"  {name} ({label}, {cell.size[0]}x{cell.size[1]})")
    return names


def _parse_tree_sprite_names(text: str) -> list[str]:
    m = re.search(r"const MEDITERRANEAN_TREE_SPRITES = \[([\s\S]*?)\];", text)
    if not m:
        raise RuntimeError("MEDITERRANEAN_TREE_SPRITES introuvable")
    return re.findall(r"tree_pack_\d+\.png", m.group(1))


def patch_js(new_names: list[str]):
    text = JS_OUT.read_text(encoding="utf-8")
    existing = _parse_tree_sprite_names(text)
    for name in new_names:
        if name not in existing:
            existing.append(name)

    tree_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in existing]
    tree_block = "const MEDITERRANEAN_TREE_SPRITES = [\n" + "\n".join(tree_lines) + "\n];"
    text, n = re.subn(
        r"const MEDITERRANEAN_TREE_SPRITES = \[[\s\S]*?\];",
        tree_block,
        text,
        count=1,
    )
    if n != 1:
        raise RuntimeError("MEDITERRANEAN_TREE_SPRITES introuvable")

    forest_match = re.search(
        r"const MEDITERRANEAN_TREE_FOREST_INDICES = \[([\d,\s]+)\];",
        text,
    )
    if not forest_match:
        raise RuntimeError("FOREST_INDICES introuvable")
    forest = [int(x.strip()) for x in forest_match.group(1).split(",") if x.strip()]
    for idx in NEW_FOREST_INDICES:
        if idx not in forest:
            forest.append(idx)
    forest.sort()
    text = re.sub(
        r"const MEDITERRANEAN_TREE_FOREST_INDICES = \[[\d,\s]+\];",
        f"const MEDITERRANEAN_TREE_FOREST_INDICES = [{', '.join(str(i) for i in forest)}];",
        text,
        count=1,
    )

    weights_match = re.search(
        r"const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = \[([\s\S]*?)\];",
        text,
    )
    if not weights_match:
        raise RuntimeError("WEIGHTS introuvable")
    weights = [
        float(x.strip().rstrip(","))
        for x in weights_match.group(1).replace("\n", " ").split(",")
        if x.strip()
    ]
    for w in NEW_WEIGHTS:
        weights.append(w)
    weights = weights[: len(existing)]
    formatted = ",\n  ".join(str(w) for w in weights)
    text = re.sub(
        r"const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = \[[\s\S]*?\];",
        f"const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = [\n  {formatted},\n];",
        text,
        count=1,
    )

    text = re.sub(
        r"// Indices :.*",
        "// Indices : 0-2 feuillus, 3-4 pins exclus, 5-7+11+13 morts, 8-9 palmiers, 10+12 pins vivants",
        text,
        count=1,
    )
    text = re.sub(r"\?v=\d+", f"?{CACHE}", text)
    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Mis a jour {JS_OUT} ({len(existing)} arbres, cache {CACHE})")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SHEET_OUT.resolve():
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT}")
    names = slice_pines(SHEET_OUT)
    patch_js(names)
    print(f"OK ({len(names)} pins ajoutes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
