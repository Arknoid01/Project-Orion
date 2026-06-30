#!/usr/bin/env python3
"""Découpe la planche nature (ChatGPT) en sprites individuels pour le décor herbe."""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SRC = ROOT / "assets" / "source" / "grass_nature_sheet.png"
OUT_DIR = ROOT / "assets" / "grass" / "nature"
MANIFEST = OUT_DIR / "manifest.json"

# Export 2× la taille à l'écran (~38 px) → downscale lissé au rendu canvas
TARGET_W = 76

# Seuils clé couleur (ajuster ici si trop agressif sur les fleurs blanches)
KEY_CHROMA_GRAY = 16
KEY_MIN_V_GRAY = 180
KEY_MIN_RGB_WHITE = 242
KEY_MIN_RGB_HALO = 228
KEY_CHROMA_HALO = 28
KEY_MIN_RGB_CREAM = 218
KEY_CHROMA_CREAM = 16
KEY_MIN_V_CREAM = 215

FRINGE_MIN_RGB = 195
FRINGE_CHROMA = 58
FRINGE_MIN_V = 200


def _chroma_rgb(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return mx - mn


def color_key_mask(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Masque booléen des pixels à effacer (damier + blancs / gris clair)."""
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    visible = alpha > 0

    keyed = np.zeros(alpha.shape, dtype=bool)
    keyed |= (c <= KEY_CHROMA_GRAY) & (v >= KEY_MIN_V_GRAY)
    keyed |= (mn >= KEY_MIN_RGB_WHITE) & (c <= 55)
    keyed |= (mn >= KEY_MIN_RGB_HALO) & (c <= KEY_CHROMA_HALO)
    keyed |= (mn >= KEY_MIN_RGB_CREAM) & (c <= KEY_CHROMA_CREAM) & (v >= KEY_MIN_V_CREAM)
    # taches blanches / gris neutre (artefacts d'export, même au centre du sprite)
    keyed |= (mn >= 250) & (c <= 10)
    keyed |= (v >= 248) & (c <= 8)
    # poussière blanche semi-transparente (LANCZOS / anti-aliasing)
    keyed |= (alpha < 24) & (mn >= 228) & (c <= 40)
    keyed |= (alpha < 16) & (v >= 210) & (c <= 45)
    return keyed & visible


def fringe_key_mask(rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Pixels clairs désaturés typiques des franges d'export (pour flood depuis les bords)."""
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    visible = alpha > 0
    fringe = (mn >= FRINGE_MIN_RGB) & (c <= FRINGE_CHROMA) & (v >= FRINGE_MIN_V)
    fringe |= (alpha < 24) & (mn >= 220) & (c <= 48)
    return fringe & visible


def remove_edge_fringe(arr: np.ndarray) -> np.ndarray:
    """Efface les halos clairs connectés au transparent (bords du sprite)."""
    out = arr.copy()
    h, w = out.shape[:2]
    alpha = out[:, :, 3] > 0
    fringe = fringe_key_mask(out[:, :, :3], out[:, :, 3])
    keyed = color_key_mask(out[:, :, :3], out[:, :, 3])
    removable = fringe | keyed

    q: deque[tuple[int, int]] = deque()
    seen = np.zeros((h, w), dtype=bool)

    def try_seed(y: int, x: int):
        if not (0 <= y < h and 0 <= x < w):
            return
        if seen[y, x] or not alpha[y, x] or not removable[y, x]:
            return
        seen[y, x] = True
        q.append((y, x))

    # pixels visibles touchant un voisin transparent ou le bord image
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
                try_seed(y, x)

    while q:
        y, x = q.popleft()
        out[y, x, 3] = 0
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w:
                try_seed(ny, nx)

    return out


def remove_keyed_bg(arr: np.ndarray) -> np.ndarray:
    out = arr.copy()
    keyed = color_key_mask(out[:, :, :3], out[:, :, 3])
    out[keyed, 3] = 0
    out = remove_edge_fringe(out)
    return out


def prune_alpha_dust(arr: np.ndarray) -> np.ndarray:
    """Supprime les pixels quasi invisibles (franges LANCZOS)."""
    out = arr.copy()
    a = out[:, :, 3]
    r = out[:, :, 0].astype(np.int16)
    g = out[:, :, 1].astype(np.int16)
    b = out[:, :, 2].astype(np.int16)
    c = _chroma_rgb(r, g, b)
    v = (r + g + b) / 3.0
    mn = np.minimum(np.minimum(r, g), b)
    dust = (a > 0) & (a < 20) & (((mn >= 220) & (c <= 45)) | ((v >= 205) & (c <= 35)))
    out[dust, 3] = 0
    return out


def clean_sprite(arr: np.ndarray) -> np.ndarray:
    """Nettoyage complet : clé couleur + franges, trois passes."""
    out = remove_keyed_bg(arr)
    out = remove_keyed_bg(out)
    out = remove_keyed_bg(out)
    out = prune_alpha_dust(out)
    return out


def find_components(rgba: np.ndarray, min_area: int = 800) -> list[tuple[int, int, int, int, int]]:
    h, w = rgba.shape[:2]
    alpha = rgba[:, :, 3] > 24
    seen = np.zeros((h, w), dtype=bool)
    boxes: list[tuple[int, int, int, int, int]] = []

    for sy in range(h):
        for sx in range(w):
            if not alpha[sy, sx] or seen[sy, sx]:
                continue
            q: deque[tuple[int, int]] = deque([(sy, sx)])
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
            if area >= min_area and bw >= 20 and bh >= 20:
                boxes.append((minx, miny, maxx, maxy, area))

    boxes.sort(key=lambda b: (b[1] // 130, b[0]))
    return boxes


def trim_transparent(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    if not bbox:
        return im
    return im.crop(bbox)


def resize_sprite(im: Image.Image, target_w: int = TARGET_W) -> Image.Image:
    im = trim_transparent(im)
    w, h = im.size
    if w <= 0 or h <= 0:
        return im
    if w == target_w:
        return im
    new_h = max(1, round(h * target_w / w))
    return im.resize((target_w, new_h), Image.Resampling.LANCZOS)


def category_for_index(i: int, bh: int) -> str:
    if bh >= 120:
        return "bush"
    if bh >= 70:
        return "plant"
    if bh >= 45:
        return "flower"
    return "ground"


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        # fallback chemin image utilisateur
        alt = list((ROOT / "assets").glob("*ChatGPT*grass*nature*.png"))
        if not alt:
            alt = list((ROOT / "assets").glob("*ChatGPT_Image*.png"))
        if alt:
            src = alt[0]
        else:
            print(f"Source introuvable: {src}", file=sys.stderr)
            return 1

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src_dir = src.parent / "source"
    src_dir.mkdir(parents=True, exist_ok=True)
    canonical = src_dir / "grass_nature_sheet.png"
    if src.resolve() != canonical.resolve():
        Image.open(src).save(canonical)

    im = Image.open(canonical).convert("RGBA")
    arr = clean_sprite(np.array(im))
    boxes = find_components(arr)

    names = [
        "bush_green", "bush_white_flowers", "bush_purple_flowers", "bush_berries",
        "bush_yellow_flowers", "bush_pink_flowers", "plant_magenta", "plant_teal_spike",
        "plant_green_spike", "plant_curl",
        "grass_spike_sm", "grass_spike_md", "flower_pink", "grass_tall",
        "wheat_golden", "lavender", "flower_bluebells", "mushrooms",
        "leaf_cluster", "sprout_sm", "sprout_md", "sprout_xs",
        "branch_mossy", "stump_mossy", "log_hollow", "log_plain",
        "log_bundle", "sticks_pile", "stump_log", "log_vertical", "moss_mound",
        "bush_dense", "bush_autumn_orange", "bush_autumn_red", "flower_patch",
        "moss_patch_sm", "moss_patch_md", "moss_patch_lg",
        "sand_pile", "dirt_pile", "grass_mound", "sand_pile_alt", "dirt_pile_alt",
    ]

    manifest_entries = []
    for i, (minx, miny, maxx, maxy, area) in enumerate(boxes):
        pad = 6
        x0 = max(0, minx - pad)
        y0 = max(0, miny - pad)
        x1 = min(im.width, maxx + pad + 1)
        y1 = min(im.height, maxy + pad + 1)
        sub = arr[y0:y1, x0:x1].copy()
        sub = clean_sprite(sub)
        sprite = Image.fromarray(sub)
        sprite = resize_sprite(sprite)
        sub2 = clean_sprite(np.array(sprite))
        sprite = Image.fromarray(sub2)
        name = names[i] if i < len(names) else f"nature_{i:02d}"
        cat = category_for_index(i, maxy - miny + 1)
        out_path = OUT_DIR / f"{name}.png"
        sprite.save(out_path)
        manifest_entries.append({
            "file": f"assets/grass/nature/{name}.png",
            "name": name,
            "category": cat,
            "sourceBox": [minx, miny, maxx, maxy],
            "size": list(sprite.size),
        })
        print(f"  {name}: {sprite.size[0]}x{sprite.size[1]} (from {maxx-minx+1}x{maxy-miny+1})")

    MANIFEST.write_text(json.dumps(manifest_entries, indent=2), encoding="utf-8")
    print(f"\n{len(manifest_entries)} sprites -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
