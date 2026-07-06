#!/usr/bin/env python3
"""Recolorise les sprites iso nature (saturation + luminosité plus vives)."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ISO_DIR = ROOT / "assets" / "iso_nature"
SOURCE_DIR = ISO_DIR / "_source"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=3"

# sat/contrast/lum globaux (PIL, sur RGB) — léger boost, pas agressif
GLOBAL_COLOR = 1.10
GLOBAL_CONTRAST = 1.03
GLOBAL_BRIGHTNESS = 1.02

# boost HSV par pixel (préserve les teintes d'origine)
PIXEL_SAT_MUL = 1.10
PIXEL_VAL_MUL = 1.02
GREEN_HUE_SAT_MUL = 1.04  # feuillage / herbe
SHADOW_LUM_MAX = 0.14     # ne pas saturer les ombres profondes


def _pixel_vivid(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a < 12:
        return 0, 0, 0, 0
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    if v <= SHADOW_LUM_MAX:
        return r, g, b, a
    sat_mul = PIXEL_SAT_MUL
    if 0.17 <= h <= 0.48 and s > 0.08:
        sat_mul *= GREEN_HUE_SAT_MUL
    s = min(1.0, s * sat_mul)
    v = min(1.0, v * PIXEL_VAL_MUL)
    nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
    return (
        min(255, int(nr * 255)),
        min(255, int(ng * 255)),
        min(255, int(nb * 255)),
        a,
    )


def vividize(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            px[x, y] = _pixel_vivid(*px[x, y])

    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(GLOBAL_COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(GLOBAL_CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(GLOBAL_BRIGHTNESS)
    alpha = im.split()[3]
    return Image.merge("RGBA", (*rgb.split(), alpha))


def _ensure_sources() -> list[Path]:
    sprites = sorted(ISO_DIR.glob("iso_*.png"))
    if not sprites:
        return []
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    for src in sprites:
        backup = SOURCE_DIR / src.name
        if not backup.exists():
            backup.write_bytes(src.read_bytes())
    return sorted(SOURCE_DIR.glob("iso_*.png"))


def _write_js():
    trees = sorted(SOURCE_DIR.glob("iso_tree_*.png"))
    props = sorted(SOURCE_DIR.glob("iso_prop_*.png"))
    if not trees and not props:
        trees = sorted(ISO_DIR.glob("iso_tree_*.png"))
        props = sorted(ISO_DIR.glob("iso_prop_*.png"))
    tree_names = [p.name for p in trees]
    prop_names = [p.name for p in props]
    tree_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in tree_names]
    prop_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in prop_names]
    weights = ",\n  ".join("1" for _ in tree_names)
    js = [
        "// Genere par tools/vivid_iso_nature.py — ne pas editer a la main.",
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
    print(f"Ecrit {JS_OUT} (cache {CACHE})")


def main():
    sources = _ensure_sources()
    if not sources:
        print("Aucun sprite iso_*.png dans assets/iso_nature/")
        return 1
    for src in sources:
        out = ISO_DIR / src.name
        im = vividize(Image.open(src))
        im.save(out, optimize=True)
        print(f"  {src.name} -> vivid ({im.size[0]}x{im.size[1]})")
    _write_js()
    print(f"OK ({len(sources)} sprites recolorises)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
