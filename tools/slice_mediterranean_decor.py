#!/usr/bin/env python3
"""Découpe les planches décor méditerranéen — nettoyage agressif + filtre végétation seule."""
from __future__ import annotations

import json
import shutil
import sys
from collections import deque
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "mediterranean"
MANIFEST = OUT_DIR / "manifest.json"
JS_OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE_BUST = "v=3"
CURATED_SHEET = False

TARGET_W_TREE = 88
TARGET_W_SHRUB = 68
TARGET_W_SMALL = 52

# Clé couleur plus agressive (damier + halos blancs)
KEY_CHROMA_GRAY = 20
KEY_MIN_V_GRAY = 168
KEY_MIN_RGB_WHITE = 235
KEY_MIN_RGB_HALO = 210
KEY_CHROMA_HALO = 38
KEY_MIN_RGB_CREAM = 205
KEY_CHROMA_CREAM = 22
KEY_MIN_V_CREAM = 200
FRINGE_MIN_RGB = 185
FRINGE_CHROMA = 65
FRINGE_MIN_V = 188
FRINGE_MAX_DEPTH = 4


def _chroma_rgb(r, g, b):
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return mx - mn


def color_key_mask(rgb, alpha):
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    visible = alpha > 0
    keyed = np.zeros(alpha.shape, dtype=bool)
    keyed |= (c <= KEY_CHROMA_GRAY) & (v >= KEY_MIN_V_GRAY)
    keyed |= (mn >= KEY_MIN_RGB_WHITE) & (c <= 62)
    keyed |= (mn >= KEY_MIN_RGB_HALO) & (c <= KEY_CHROMA_HALO)
    keyed |= (mn >= KEY_MIN_RGB_CREAM) & (c <= KEY_CHROMA_CREAM) & (v >= KEY_MIN_V_CREAM)
    keyed |= (mn >= 248) & (c <= 12)
    keyed |= (v >= 245) & (c <= 10)
    keyed |= (alpha < 32) & (mn >= 215) & (c <= 48)
    keyed |= (alpha < 24) & (v >= 200) & (c <= 50)
    keyed |= (alpha < 48) & (mn >= 230) & (c <= 35)
    return keyed & visible


def fringe_key_mask(rgb, alpha):
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    visible = alpha > 0
    fringe = (mn >= FRINGE_MIN_RGB) & (c <= FRINGE_CHROMA) & (v >= FRINGE_MIN_V)
    fringe |= (alpha < 32) & (mn >= 205) & (c <= 55)
    fringe |= (alpha < 48) & (v >= 195) & (c <= 42)
    return fringe & visible


def remove_edge_fringe(arr, max_depth=FRINGE_MAX_DEPTH):
    out = arr.copy()
    h, w = out.shape[:2]
    alpha = out[:, :, 3] > 0
    fringe = fringe_key_mask(out[:, :, :3], out[:, :, 3])
    keyed = color_key_mask(out[:, :, :3], out[:, :, 3])
    removable = fringe | keyed
    q = deque()
    seen = np.zeros((h, w), dtype=bool)
    depth = np.full((h, w), -1, dtype=np.int16)

    def try_seed(y, x, d=0):
        if not (0 <= y < h and 0 <= x < w):
            return
        if seen[y, x] or not alpha[y, x] or not removable[y, x] or d > max_depth:
            return
        seen[y, x] = True
        depth[y, x] = d
        q.append((y, x, d))

    for y in range(h):
        for x in range(w):
            if not alpha[y, x] or not removable[y, x]:
                continue
            on_border = y == 0 or y == h - 1 or x == 0 or x == w - 1
            touches_clear = on_border
            if not touches_clear:
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and not alpha[ny, nx]:
                        touches_clear = True
                        break
            if touches_clear:
                try_seed(y, x, 0)

    while q:
        y, x, d = q.popleft()
        out[y, x, 3] = 0
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w:
                try_seed(ny, nx, d + 1)
    return out


def prune_alpha_dust(arr):
    out = arr.copy()
    a = out[:, :, 3]
    r = out[:, :, 0].astype(np.int16)
    g = out[:, :, 1].astype(np.int16)
    b = out[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    dust = (a > 0) & (a < 28) & (((mn >= 210) & (c <= 50)) | ((v >= 198) & (c <= 40)))
    out[dust, 3] = 0
    return out


def remove_keyed_bg(arr):
    out = arr.copy()
    keyed = color_key_mask(out[:, :, :3], out[:, :, 3])
    out[keyed, 3] = 0
    out = remove_edge_fringe(out)
    return out


def clean_sprite(arr):
    out = remove_keyed_bg(arr)
    out = remove_keyed_bg(out)
    out = remove_keyed_bg(out)
    out = prune_alpha_dust(out)
    out = remove_edge_fringe(out, max_depth=5)
    return out


def sprite_color_stats(arr):
    alpha = arr[:, :, 3] > 40
    n = int(alpha.sum())
    if n <= 0:
        return {"green": 0.0, "autumn": 0.0, "floral": 0.0, "stone": 1.0, "terracotta": 0.0}

    r = arr[:, :, 0][alpha].astype(float)
    g = arr[:, :, 1][alpha].astype(float)
    b = arr[:, :, 2][alpha].astype(float)

    green = (g > r * 0.90) & (g > b * 0.85) & (g > 50)
    autumn = (r > 115) & (g > 70) & (b < g * 0.82) & (r >= g * 0.82)
    floral = ((r > 145) & (g < 145) & (b > 95) & (r > g)) | ((b > 110) & (g > 90) & (r < g) & (b > r))
    stone = (np.abs(r - g) < 30) & (np.abs(g - b) < 30) & (r > 90) & (r < 220)
    terracotta = (r > 130) & (g < 118) & (b < 98) & (r > g * 1.05)

    return {
        "green": float(green.sum()) / n,
        "autumn": float(autumn.sum()) / n,
        "floral": float(floral.sum()) / n,
        "stone": float(stone.sum()) / n,
        "terracotta": float(terracotta.sum()) / n,
    }


def is_wheat_like(arr):
    alpha = arr[:, :, 3] > 40
    if not alpha.any():
        return False
    r = arr[:, :, 0][alpha].astype(float)
    g = arr[:, :, 1][alpha].astype(float)
    b = arr[:, :, 2][alpha].astype(float)
    golden = (r > 150) & (g > 120) & (b < 120) & (r > g) & (g > b * 0.7)
    ratio = golden.sum() / max(1, alpha.sum())
    h, w = arr.shape[:2]
    aspect = w / max(1, h)
    return ratio > 0.28 and aspect < 1.4 and h >= 35


def is_natural_vegetation(arr, bh, bw):
    """Arbres, arbustes, fleurs — exclut pierre, poterie, statues, colonnes."""
    if is_wheat_like(arr):
        return False

    s = sprite_color_stats(arr)
    vegetation = s["green"] + s["autumn"] * 0.85 + s["floral"] * 0.65
    artifact = s["stone"] + s["terracotta"] * 1.25

    if vegetation < 0.15:
        return False

    # Cyprès / conifères sombres : peu de vert mais pas pierre
    if bh >= 120 and s["green"] >= 0.12 and artifact < 0.22:
        return True

    if bh >= 80:
        return vegetation >= 0.18 and artifact < 0.36 and s["stone"] < 0.32

    # Arbustes : exiger du vert ou des fleurs (pas seulement brun / terre cuite)
    if bh >= 40:
        if s["green"] + s["floral"] < 0.12:
            return False
        return vegetation >= 0.25 and artifact < 0.30 and s["stone"] < 0.26

    if s["green"] + s["floral"] < 0.08:
        return False
    return vegetation >= 0.18 and artifact < 0.24 and s["terracotta"] < 0.10


def classify_by_row(miny, sheet_h):
    """Planche triée en 5 rangées : arbres, arbustes fleuris, buissons, conifères, touffes."""
    row = int(miny / max(1, sheet_h / 5))
    row = min(4, max(0, row))
    if row in (0,):
        return "tree"
    if row == 3:
        return "skip_conifer"
    if row == 4:
        return "small"
    return "shrub"


def classify_natural(bh, miny=0, sheet_h=682):
    if CURATED_SHEET:
        return classify_by_row(miny, sheet_h)
    if bh >= 80:
        return "tree"
    if bh >= 38:
        return "shrub"
    return "small"


def find_components(rgba, min_area=700):
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3] > 24
    seen = np.zeros((h, w), dtype=bool)
    boxes = []
    for sy in range(h):
        for sx in range(w):
            if not alpha[sy, sx] or seen[sy, sx]:
                continue
            q = deque([(sy, sx)])
            seen[sy, sx] = True
            minx = maxx = sx
            miny = maxy = sy
            area = 0
            while q:
                y, x = q.popleft()
                area += 1
                minx = min(minx, x)
                maxx = max(maxx, x)
                miny = min(miny, y)
                maxy = max(maxy, y)
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < h and 0 <= nx < w and alpha[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            bw, bh = maxx - minx + 1, maxy - miny + 1
            if area >= min_area and bw >= 18 and bh >= 18:
                boxes.append((minx, miny, maxx, maxy, area))
    boxes.sort(key=lambda b: (b[1] // 120, b[0]))
    return boxes


def trim_transparent(im):
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def resize_sprite(im, target_w):
    im = trim_transparent(im)
    w, h = im.size
    if w <= 0 or h <= 0:
        return im
    if w == target_w:
        return im
    new_h = max(1, round(h * target_w / w))
    return im.resize((target_w, new_h), Image.Resampling.LANCZOS)


def process_sheet(path: Path, sheet_id: int, entries: list, start_index: int) -> int:
    im = Image.open(path).convert("RGBA")
    sheet_h = im.height
    arr = clean_sprite(np.array(im))
    boxes = find_components(arr)
    idx = start_index
    for minx, miny, maxx, maxy, area in boxes:
        pad = 6
        x0 = max(0, minx - pad)
        y0 = max(0, miny - pad)
        x1 = min(im.width, maxx + pad + 1)
        y1 = min(im.height, maxy + pad + 1)
        sub = arr[y0:y1, x0:x1].copy()
        sub = clean_sprite(sub)
        bw, bh = maxx - minx + 1, maxy - miny + 1

        if not CURATED_SHEET and not is_natural_vegetation(sub, bh, bw):
            s = sprite_color_stats(sub)
            print(f"  skip non-vegetation s{sheet_id}_{idx:02d} ({bw}x{bh}) green={s['green']:.2f} stone={s['stone']:.2f}")
            continue

        if CURATED_SHEET and is_wheat_like(sub):
            print(f"  skip wheat s{sheet_id}_{idx:02d}")
            continue

        kind = classify_natural(bh, miny, sheet_h)
        if kind == "skip_conifer":
            print(f"  skip conifer row s{sheet_id}_{idx:02d} ({bw}x{bh})")
            continue

        target = TARGET_W_TREE if kind == "tree" else (TARGET_W_SHRUB if kind == "shrub" else TARGET_W_SMALL)
        sprite = Image.fromarray(sub)
        sprite = resize_sprite(sprite, target)
        sprite = Image.fromarray(clean_sprite(np.array(sprite)))

        if trim_transparent(sprite).size[0] < 12:
            continue

        prefix = "nature" if CURATED_SHEET else f"s{sheet_id}"
        name = f"{prefix}_{kind}_{idx:02d}.png"
        out_path = OUT_DIR / name
        sprite.save(out_path)
        stats = sprite_color_stats(np.array(sprite))
        entries.append({
            "file": f"assets/mediterranean/{name}",
            "kind": kind,
            "sheet": sheet_id,
            "sourceBox": [minx, miny, maxx, maxy],
            "size": list(sprite.size),
            "stats": stats,
        })
        print(f"  {name}: {sprite.size[0]}x{sprite.size[1]} ({kind}) veg={stats['green']:.2f}+{stats['floral']:.2f}")
        idx += 1
    return idx


def write_js(entries):
    trees = [e["file"] for e in entries if e["kind"] == "tree"]
    shrubs = [e["file"] for e in entries if e["kind"] in ("shrub", "small")]
    label = "planche nature triée" if CURATED_SHEET else "végétation naturelle uniquement"
    js = f"// Généré par tools/slice_mediterranean_decor.py — {label}\n"
    js += f"const MEDITERRANEAN_TREE_SPRITES = [\n"
    js += "".join(f"  '{p}?{CACHE_BUST}',\n" for p in trees)
    js += "];\n\n"
    js += "const MEDITERRANEAN_PROP_SPRITES = [\n"
    js += "".join(f"  '{p}?{CACHE_BUST}',\n" for p in shrubs)
    js += "];\n"
    JS_OUT.write_text(js, encoding="utf-8")


def purge_old_sprites():
    if OUT_DIR.exists():
        for p in OUT_DIR.glob("*.png"):
            p.unlink()


def main():
    global CURATED_SHEET
    args = [a for a in sys.argv[1:] if a != "--curated"]
    if "--curated" in sys.argv[1:]:
        CURATED_SHEET = True

    sources = args
    if not sources:
        src_dir = ROOT / "assets" / "source"
        curated = src_dir / "nature_sheet.png"
        if curated.exists():
            sources = [str(curated)]
            CURATED_SHEET = True
        else:
            sources = [str(src_dir / f"mediterranean_sheet_{i}.png") for i in (1, 2)]
            sources = [s for s in sources if Path(s).exists()]
    if not sources:
        assets = ROOT / "assets"
        sources = sorted(str(p) for p in assets.glob("*ChatGPT_Image*nature*.png"))
        if not sources:
            sources = sorted(str(p) for p in assets.glob("*ChatGPT_Image*.png"))
    if not sources:
        print("Usage: slice_mediterranean_decor.py [--curated] sheet.png ...", file=sys.stderr)
        return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src_dir = ROOT / "assets" / "source"
    src_dir.mkdir(parents=True, exist_ok=True)
    purge_old_sprites()

    entries = []
    idx = 0
    for i, src in enumerate(sources, start=1):
        p = Path(src)
        canonical = src_dir / ("nature_sheet.png" if CURATED_SHEET else f"mediterranean_sheet_{i}.png")
        if p.resolve() != canonical.resolve():
            shutil.copy2(p, canonical)
        print(f"\nSheet {i}: {p.name} (curated={CURATED_SHEET})")
        idx = process_sheet(canonical, i, entries, idx)

    MANIFEST.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    write_js(entries)
    trees = sum(1 for e in entries if e["kind"] == "tree")
    shrubs = sum(1 for e in entries if e["kind"] in ("shrub", "small"))
    print(f"\n{len(entries)} sprites naturels ({trees} arbres, {shrubs} arbustes) -> {OUT_DIR}")
    print(f"Config JS -> {JS_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
