#!/usr/bin/env python3
"""Découpe planche arbres feuillus/cyprès → tree_pack_10..16 + harmonisation couleurs."""

from __future__ import annotations

import colorsys
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "iso_nature"
SHEET_OUT = OUT_DIR / "tree_extra_sheet.png"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=15"

# Planche 1024×682 — 4 feuillus + 3 cyprès
TREE_BOXES = [
    ("tree_pack_10.png", (57, 24, 205, 176), "feuillu 1"),
    ("tree_pack_11.png", (224, 32, 357, 175), "feuillu 2"),
    ("tree_pack_12.png", (379, 24, 503, 174), "feuillu 3"),
    ("tree_pack_13.png", (242, 234, 352, 374), "feuillu 4"),
    ("tree_pack_14.png", (584, 452, 642, 657), "cypres 1"),
    ("tree_pack_15.png", (686, 492, 743, 654), "cypres 2"),
    ("tree_pack_16.png", (775, 452, 846, 655), "cypres 3"),
]

NEW_FOREST_INDICES = [10, 11, 12, 13, 14, 15, 16]
NEW_WEIGHTS = [1.18, 1.14, 1.12, 1.10, 0.58, 0.55, 0.52]
NEW_SIZE_MUL = [1, 1, 1, 1, 0.56, 0.54, 0.56]

# Cibles = feuillus existants tree_pack_00..02 (après soften)
REF_GREEN = (0.264, 0.543, 0.432)
REF_BROWN = (0.090, 0.566, 0.364)
# Conserve un peu de relief local, mais palette unifiée entre les 7 sprites
HUE_VAR_KEEP = 0.18
SAT_VAR_KEEP = 0.28
VAL_VAR_KEEP = 0.32
BROWN_STRENGTH = 0.88
BLACK_KEY = 24

GLOBAL_COLOR = 0.97
GLOBAL_CONTRAST = 0.98
GLOBAL_BRIGHTNESS = 1.02
GREEN_HUE_RANGE = (0.14, 0.50)
SHADOW_LUM_MAX = 0.12


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


def _is_green(h: float, s: float, v: float) -> bool:
    return GREEN_HUE_RANGE[0] <= h <= GREEN_HUE_RANGE[1] and s > 0.10 and v > SHADOW_LUM_MAX


def _is_brown(h: float, s: float, v: float) -> bool:
    return 0.02 <= h <= 0.16 and s > 0.06 and 0.12 < v < 0.88


def _foliage_stats(im: Image.Image) -> tuple[float, float, float]:
    hs, ss, vs = [], [], []
    for r, g, b, a in im.getdata():
        if a < 40:
            continue
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if _is_green(h, s, v):
            hs.append(h)
            ss.append(s)
            vs.append(v)
    if not hs:
        rh, rs, rv = REF_GREEN
        return rh, rs, rv
    return sum(hs) / len(hs), sum(ss) / len(ss), sum(vs) / len(vs)


def _harmonize_pixel(
    r: int,
    g: int,
    b: int,
    a: int,
    mean_h: float,
    mean_s: float,
    mean_v: float,
) -> tuple[int, int, int, int]:
    if a < 12:
        return 0, 0, 0, 0
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    if v <= SHADOW_LUM_MAX:
        return r, g, b, a

    if _is_green(h, s, v):
        rh, rs, rv = REF_GREEN
        h = rh + (h - mean_h) * HUE_VAR_KEEP
        s = rs + (s - mean_s) * SAT_VAR_KEEP
        v = rv + (v - mean_v) * VAL_VAR_KEEP
    elif _is_brown(h, s, v):
        rh, rs, rv = REF_BROWN
        h = h + (rh - h) * BROWN_STRENGTH
        s = s + (rs - s) * BROWN_STRENGTH
        v = v + (rv - v) * BROWN_STRENGTH

    h %= 1.0
    s = max(0.0, min(1.0, s))
    v = max(0.0, min(1.0, v))
    nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
    return (
        min(255, int(nr * 255)),
        min(255, int(ng * 255)),
        min(255, int(nb * 255)),
        a,
    )


def _process(im: Image.Image) -> Image.Image:
    im = _key_black(im).convert("RGBA")
    mean_h, mean_s, mean_v = _foliage_stats(im)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            px[x, y] = _harmonize_pixel(*px[x, y], mean_h, mean_s, mean_v)
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(GLOBAL_COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(GLOBAL_CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(GLOBAL_BRIGHTNESS)
    return _trim(Image.merge("RGBA", (*rgb.split(), im.split()[3])))


def slice_trees(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    source_dir = OUT_DIR / "_source_trees"
    source_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for name, (x0, y0, x1, y1), label in TREE_BOXES:
        cell = im.crop((x0, y0, x1 + 1, y1 + 1))
        cell.save(source_dir / name, optimize=True)
        out = _process(cell)
        out.save(OUT_DIR / name, optimize=True)
        names.append(name)
        print(f"  {name} ({label}, {out.size[0]}x{out.size[1]})")
    return names


def _parse_tree_sprite_names(text: str) -> list[str]:
    m = re.search(r"const MEDITERRANEAN_TREE_SPRITES = \[([\s\S]*?)\];", text)
    if not m:
        raise RuntimeError("MEDITERRANEAN_TREE_SPRITES introuvable")
    return re.findall(r"tree_pack_\d+\.png", m.group(1))


def reprocess_existing() -> list[str]:
    source_dir = OUT_DIR / "_source_trees"
    names = [n for n, _, _ in TREE_BOXES]
    for name in names:
        src = source_dir / name
        if not src.is_file():
            print(f"  skip {name} (source manquante)")
            continue
        out = _process(Image.open(src))
        out.save(OUT_DIR / name, optimize=True)
        print(f"  {name} reharm ({out.size[0]}x{out.size[1]})")
    return names


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
        "// Indices : 0-2+10-16 vivants forêt, 3-4 exclus, 5-7 morts, 8-9 palmiers sable",
        text,
        count=1,
    )

    # Bump cache arbres uniquement (herbes restent v=13)
    text = re.sub(
        r"(assets/iso_nature/tree_pack_\d+\.png\?)v=\d+",
        rf"\g<1>{CACHE}",
        text,
    )
    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Mis a jour {JS_OUT} ({len(existing)} arbres)")


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--reprocess":
        print("Re-harmonisation tree_pack_10..16")
        names = reprocess_existing()
        patch_js(names)
        print(f"OK ({len(names)} arbres)")
        return 0

    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if src.resolve() != SHEET_OUT.resolve():
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT}")
    names = slice_trees(SHEET_OUT)
    patch_js(names)
    print(f"OK ({len(names)} arbres ajoutes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
