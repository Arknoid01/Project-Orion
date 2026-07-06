#!/usr/bin/env python3
"""Assombrit légèrement les arbres originaux tree_pack_00..09 pour les rapprocher du pack extra."""

from __future__ import annotations

import colorsys
import re
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
ISO_DIR = ROOT / "assets" / "iso_nature"
SOURCE_DIR = ISO_DIR / "_source_trees"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=16"
OLD_RANGE = range(0, 10)

# Passage très léger — juste un cran sous le pack extra harmonisé
MUTE_GREEN_SAT = 0.955
MUTE_COLOR = 0.965
MUTE_BRIGHTNESS = 0.985
MUTE_CONTRAST = 0.985
GREEN_HUE_RANGE = (0.14, 0.50)
SHADOW_LUM_MAX = 0.12


def _mute_pixel(r: int, g: int, b: int, a: int) -> tuple[int, int, int, int]:
    if a < 12:
        return 0, 0, 0, 0
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    h, s, v = colorsys.rgb_to_hsv(rf, gf, bf)
    if v <= SHADOW_LUM_MAX:
        return r, g, b, a
    if GREEN_HUE_RANGE[0] <= h <= GREEN_HUE_RANGE[1] and s > 0.10:
        s = max(0.0, min(1.0, s * MUTE_GREEN_SAT))
        v = max(0.0, min(1.0, v * 0.992))
        nr, ng, nb = colorsys.hsv_to_rgb(h, s, v)
        return (
            min(255, int(nr * 255)),
            min(255, int(ng * 255)),
            min(255, int(nb * 255)),
            a,
        )
    return r, g, b, a


def mute(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            px[x, y] = _mute_pixel(*px[x, y])
    rgb = im.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(MUTE_COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(MUTE_CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(MUTE_BRIGHTNESS)
    return Image.merge("RGBA", (*rgb.split(), im.split()[3]))


def bump_js_cache():
    if not JS_OUT.is_file():
        return
    text = JS_OUT.read_text(encoding="utf-8")
    for i in OLD_RANGE:
        text = re.sub(
            rf"(assets/iso_nature/tree_pack_{i:02d}\.png\?)v=\d+",
            rf"\g<1>{CACHE}",
            text,
        )
    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Cache JS tree_pack_00..09 -> {CACHE}")


def main():
    count = 0
    for i in OLD_RANGE:
        path = ISO_DIR / f"tree_pack_{i:02d}.png"
        if not path.is_file():
            print(f"  skip tree_pack_{i:02d}.png")
            continue
        im = mute(Image.open(path))
        im.save(path, optimize=True)
        print(f"  tree_pack_{i:02d}.png mute ({im.size[0]}x{im.size[1]})")
        count += 1
    bump_js_cache()
    print(f"OK ({count} arbres originaux)")
    return 0 if count else 1


if __name__ == "__main__":
    raise SystemExit(main())
