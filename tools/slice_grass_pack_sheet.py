#!/usr/bin/env python3
"""Découpe planche buissons séparés → assets/iso_nature/grass_prop_XX.png."""

from __future__ import annotations

import colorsys
import re
import shutil
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "iso_nature"
SHEET_OUT = OUT_DIR / "bush_pack_sheet.png"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = "v=23"

MIN_SPRITE_PX = 120
MIN_BAND = 8

GLOBAL_COLOR = 0.92
GLOBAL_CONTRAST = 0.97
GLOBAL_BRIGHTNESS = 0.99
PIXEL_SAT_MUL = 0.92
GREEN_HUE_SAT_MUL = 0.78
GREEN_HUE_RANGE = (0.14, 0.50)
SHADOW_LUM_MAX = 0.12


def _is_background(r: int, g: int, b: int, a: int) -> bool:
    if a < 12:
        return True
    spread = max(r, g, b) - min(r, g, b)
    lum = min(r, g, b)
    if lum >= 248 and spread <= 18:
        return True
    if 200 <= lum <= 250 and spread <= 14:
        return True
    _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
    if v >= 0.80 and s <= 0.10:
        return True
    if v >= 0.68 and s <= 0.06:
        return True
    return False


def _segments(active: list[bool], min_size: int) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    start = None
    for i, on in enumerate(active):
        if on and start is None:
            start = i
        elif not on and start is not None:
            if i - start >= min_size:
                out.append((start, i - 1))
            start = None
    if start is not None and len(active) - start >= min_size:
        out.append((start, len(active) - 1))
    return out


def _detect_sprite_boxes(im: Image.Image) -> list[tuple[int, int, int, int]]:
    """Bounding boxes via connected components (planche déjà séparée)."""
    im = im.convert("RGBA")
    w, h = im.size
    mask = [
        [not _is_background(*im.getpixel((x, y))) for x in range(w)]
        for y in range(h)
    ]
    seen = [[False] * w for _ in range(h)]
    boxes: list[tuple[int, int, int, int]] = []
    for y0 in range(h):
        for x0 in range(w):
            if not mask[y0][x0] or seen[y0][x0]:
                continue
            q: deque[tuple[int, int]] = deque([(x0, y0)])
            seen[y0][x0] = True
            min_x = max_x = x0
            min_y = max_y = y0
            cnt = 0
            while q:
                x, y = q.popleft()
                cnt += 1
                min_x = min(min_x, x)
                max_x = max(max_x, x)
                min_y = min(min_y, y)
                max_y = max(max_y, y)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if cnt >= MIN_SPRITE_PX:
                boxes.append((min_x, min_y, max_x, max_y))
    boxes.sort(key=lambda b: (b[1] // 40, b[0]))
    return boxes


def _trim(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def _key_background(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    seen = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int):
        if seen[y][x]:
            return
        c = px[x, y]
        if _is_background(c[0], c[1], c[2], c[3]):
            seen[y][x] = True
            q.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                try_seed(nx, ny)
    return im


def _decontaminate_halo(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 10:
                px[x, y] = (0, 0, 0, 0)
                continue
            spread = max(r, g, b) - min(r, g, b)
            lum = min(r, g, b)
            _, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            if lum >= 205 and spread <= 42:
                px[x, y] = (0, 0, 0, 0)
                continue
            if lum >= 168 and s <= 0.24:
                t = min(1.0, (lum - 168) / 70) * min(1.0, (0.24 - s) / 0.24)
                na = int(a * (1.0 - t * 0.98))
                if na < 28:
                    px[x, y] = (0, 0, 0, 0)
                else:
                    k = na / 255.0
                    px[x, y] = (int(r * k), int(g * k), int(b * k), na)
                continue
            if a < 250 and (lum >= 195 or (v >= 0.72 and s <= 0.12)):
                k = a / 255.0
                px[x, y] = (int(r * k), int(g * k), int(b * k), a)
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


def _process_cell(cell: Image.Image) -> Image.Image:
    cell = _key_background(cell)
    cell = _trim(cell)
    cell = _decontaminate_halo(cell)
    cell = _trim(cell)

    px = cell.load()
    w, h = cell.size
    alpha = cell.split()[3]
    for y in range(h):
        for x in range(w):
            px[x, y] = _pixel_soften(*px[x, y])

    rgb = cell.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(GLOBAL_COLOR)
    rgb = ImageEnhance.Contrast(rgb).enhance(GLOBAL_CONTRAST)
    rgb = ImageEnhance.Brightness(rgb).enhance(GLOBAL_BRIGHTNESS)
    out = Image.merge("RGBA", (*rgb.split(), alpha))
    out = _decontaminate_halo(out)
    return _trim(out)


def slice_bushes(sheet_path: Path) -> list[str]:
    im = Image.open(sheet_path).convert("RGBA")
    boxes = _detect_sprite_boxes(im)
    if not boxes:
        raise RuntimeError("Aucun buisson detecte sur la planche")
    source_dir = OUT_DIR / "_source_grass"
    source_dir.mkdir(parents=True, exist_ok=True)
    names = []
    for idx, (x0, y0, x1, y1) in enumerate(boxes):
        name = f"grass_prop_{idx:02d}.png"
        cell = im.crop((x0, y0, x1 + 1, y1 + 1))
        cell.save(source_dir / name, optimize=True)
        out = _process_cell(cell)
        out.save(OUT_DIR / name, optimize=True)
        names.append(name)
        print(f"  {name} ({out.size[0]}x{out.size[1]})")
    for old in OUT_DIR.glob("grass_prop_*.png"):
        if old.name not in names:
            old.unlink(missing_ok=True)
            print(f"  supprime {old.name}")
    for old in source_dir.glob("grass_prop_*.png"):
        if old.name not in names:
            old.unlink(missing_ok=True)
    return names


def patch_js_prop_sprites(prop_names: list[str]):
    if not JS_OUT.is_file():
        raise FileNotFoundError(JS_OUT)
    text = JS_OUT.read_text(encoding="utf-8")
    prop_lines = [f"  'assets/iso_nature/{n}?{CACHE}'," for n in prop_names]
    block = "const MEDITERRANEAN_PROP_SPRITES = [\n" + "\n".join(prop_lines) + "\n];"
    text, n = re.subn(
        r"const MEDITERRANEAN_PROP_SPRITES = \[[\s\S]*?\];",
        block,
        text,
        count=1,
    )
    if n != 1:
        raise RuntimeError("MEDITERRANEAN_PROP_SPRITES introuvable dans le JS")
    JS_OUT.write_text(text, encoding="utf-8")
    print(f"Mis a jour {JS_OUT} ({len(prop_names)} buissons, cache {CACHE})")


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SHEET_OUT
    if not src.is_file():
        print(f"Planche introuvable : {src}")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 1:
        shutil.copy2(src, SHEET_OUT)
    print(f"Decoupe {SHEET_OUT} (auto-detect)")
    props = slice_bushes(SHEET_OUT)
    patch_js_prop_sprites(props)
    print(f"OK ({len(props)} buissons)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
