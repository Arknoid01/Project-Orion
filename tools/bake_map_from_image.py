#!/usr/bin/env python3
"""
Découpe une grande image (île / carte) en losanges iso alignés sur la grille Olympos.

Produit assets/maps/terrain_baked.png (3960×2040) : chaque case = losange 64×32
prélevé sur l'image source aux coordonnées monde du jeu.

Usage :
  python tools/bake_map_from_image.py chemin/vers/ile.png
  python tools/bake_map_from_image.py chemin/vers/ile.png --preview

Puis dans js/config.js : MAP_TERRAIN_RENDER = 'artwork'
"""

from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "maps")

# Aligné sur js/config.js
GRID_COLS = 60
GRID_ROWS = 60
TILE_W = 64
TILE_H = 32
OFFSET_X = 1952
OFFSET_Y = 80
WORLD_WIDTH = 3960
WORLD_HEIGHT = 2040


def tile_center(col: int, row: int) -> tuple[float, float]:
    x = OFFSET_X + (col - row) * (TILE_W / 2)
    y = OFFSET_Y + (col + row) * (TILE_H / 2)
    return x, y


def tile_sort_key(col: int, row: int) -> int:
    return col + row


def diamond_points(cx: float, cy: float) -> list[tuple[float, float]]:
    return [
        (cx, cy - TILE_H / 2),
        (cx + TILE_W / 2, cy),
        (cx, cy + TILE_H / 2),
        (cx - TILE_W / 2, cy),
    ]


def fit_cover(im: Image.Image, tw: int, th: int) -> Image.Image:
    """Recadre au centre puis redimensionne pour couvrir tw×th."""
    im = im.convert("RGBA")
    src_w, src_h = im.size
    scale = max(tw / src_w, th / src_h)
    nw = max(1, int(src_w * scale))
    nh = max(1, int(src_h * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return im.crop((left, top, left + tw, top + th))


def bake_tiles(source: Image.Image) -> Image.Image:
    """Compose la couche terrain losange par losange."""
    src = fit_cover(source, WORLD_WIDTH, WORLD_HEIGHT)
    out = Image.new("RGBA", (WORLD_WIDTH, WORLD_HEIGHT), (0, 0, 0, 0))

    tiles = [(c, r) for r in range(GRID_ROWS) for c in range(GRID_COLS)]
    tiles.sort(key=lambda t: tile_sort_key(t[0], t[1]))

    for col, row in tiles:
        cx, cy = tile_center(col, row)
        ix, iy = int(round(cx)), int(round(cy))
        sx = max(0, ix - TILE_W // 2)
        sy = max(0, iy - TILE_H // 2)
        ex = min(WORLD_WIDTH, sx + TILE_W)
        ey = min(WORLD_HEIGHT, sy + TILE_H)
        patch = src.crop((sx, sy, ex, ey))

        mask = Image.new("L", (TILE_W, TILE_H), 0)
        mdraw = ImageDraw.Draw(mask)
        local_cx = ix - sx
        local_cy = iy - sy
        mdraw.polygon(diamond_points(local_cx, local_cy), fill=255)

        layer = Image.new("RGBA", (WORLD_WIDTH, WORLD_HEIGHT), (0, 0, 0, 0))
        layer.paste(patch, (sx, sy), mask)
        out = Image.alpha_composite(out, layer)

    return out


def draw_preview(baked: Image.Image) -> Image.Image:
    """Grille losange par-dessus pour contrôle."""
    prev = baked.copy()
    draw = ImageDraw.Draw(prev)
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cx, cy = tile_center(col, row)
            draw.polygon(diamond_points(cx, cy), outline=(255, 255, 0, 180))
    return prev


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(
            "Usage: python tools/bake_map_from_image.py chemin/vers/carte.png [--preview]"
        )

    src_path = os.path.abspath(sys.argv[1])
    preview = "--preview" in sys.argv
    if not os.path.isfile(src_path):
        raise SystemExit(f"Fichier introuvable : {src_path}")

    os.makedirs(OUT_DIR, exist_ok=True)
    source = Image.open(src_path)
    print(f"Source : {src_path} ({source.size[0]}×{source.size[1]})")

    baked = bake_tiles(source)
    out_path = os.path.join(OUT_DIR, "terrain_baked.png")
    baked.save(out_path)
    print(f"OK  terrain_baked.png -> {out_path} ({baked.size[0]}×{baked.size[1]})")

    source_copy = os.path.join(OUT_DIR, "source.png")
    fit_cover(source, WORLD_WIDTH, WORLD_HEIGHT).save(source_copy)
    print(f"OK  source.png (recadrée {WORLD_WIDTH}×{WORLD_HEIGHT})")

    if preview:
        prev_path = os.path.join(OUT_DIR, "terrain_preview.png")
        draw_preview(baked).save(prev_path)
        print(f"OK  terrain_preview.png (grille losange)")

    print("\nDans js/config.js : MAP_TERRAIN_RENDER = 'artwork'")
    print("Puis Ctrl+F5 dans le jeu.")


if __name__ == "__main__":
    main()
