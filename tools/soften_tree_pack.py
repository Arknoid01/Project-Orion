#!/usr/bin/env python3
"""Adoucit les arbres tree_pack (trop verts / contrastés dans l'art source)."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ISO_DIR = ROOT / "assets" / "iso_nature"
SOURCE_DIR = ISO_DIR / "_source_trees"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=6"

GLOBAL_COLOR = 0.88
GLOBAL_CONTRAST = 0.96
GLOBAL_BRIGHTNESS = 0.98

PIXEL_SAT_MUL = 0.92
GREEN_HUE_SAT_MUL = 0.72
GREEN_HUE_RANGE = (0.14, 0.50)
SHADOW_LUM_MAX = 0.12


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


def soften(im: Image.Image) -> Image.Image:
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


def _bump_js_cache():
    if not JS_OUT.is_file():
        return
    text = JS_OUT.read_text(encoding="utf-8")
    import re
    text = re.sub(r"\?v=\d+", f"?{CACHE}", text)
    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Cache JS -> {CACHE}")


def main():
    sources = sorted(SOURCE_DIR.glob("tree_pack_*.png"))
    if not sources:
        sources = sorted(ISO_DIR.glob("tree_pack_*.png"))
        SOURCE_DIR.mkdir(parents=True, exist_ok=True)
        for src in sources:
            (SOURCE_DIR / src.name).write_bytes(src.read_bytes())
        sources = sorted(SOURCE_DIR.glob("tree_pack_*.png"))
    if not sources:
        print("Aucun tree_pack_*.png")
        return 1
    for src in sources:
        out = ISO_DIR / src.name
        im = soften(Image.open(src))
        im.save(out, optimize=True)
        print(f"  {src.name} -> soften ({im.size[0]}x{im.size[1]})")
    _bump_js_cache()
    print(f"OK ({len(sources)} arbres adoucis)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
