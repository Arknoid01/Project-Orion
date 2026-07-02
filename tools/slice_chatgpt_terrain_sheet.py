#!/usr/bin/env python3
"""Decoupe la planche ChatGPT (8 textures) -> generated_mediterranean/."""

from __future__ import annotations

import argparse
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "assets", "source", "chatgpt_terrain_sheet.png")
OUT_DIR = os.path.join(ROOT, "assets", "tiles", "generated_mediterranean")

ROW_NAMES = [
    ["grass", "forest", "wheat"],
    ["sand", "dirt", "rock"],
    ["marble", "water"],
]

# Marges par texture (optionnel) — eau : un peu plus haut pour eviter la couture horizontale
TILE_MARGINS = {
    "water": {"margin_top": 0.16, "margin_bottom": 0.40},
}


def detect_tile_rows(sheet: Image.Image, rows: int = 3) -> list[list[tuple[int, int, int, int]]]:
    """Detecte les bbox (x0,y0,x1,y1) de chaque tuile par ligne (fond noir)."""
    rgb = np.array(sheet.convert("RGB"))
    h, w = rgb.shape[:2]
    result: list[list[tuple[int, int, int, int]]] = []

    for row in range(rows):
        ry0 = int(row * h / rows)
        ry1 = int((row + 1) * h / rows)
        strip = rgb[ry0:ry1]
        col_hits = (strip.max(axis=2) > 20).sum(axis=0)

        boxes: list[tuple[int, int, int, int]] = []
        in_tile = False
        tx0 = 0
        for x in range(w):
            if col_hits[x] > 10:
                if not in_tile:
                    tx0 = x
                    in_tile = True
            elif in_tile:
                if x - tx0 > 80:
                    boxes.append((tx0, ry0, x, ry1))
                in_tile = False
        if in_tile and w - tx0 > 80:
            boxes.append((tx0, ry0, w, ry1))
        result.append(boxes)

    return result


def extract_center_texture(
    tile: Image.Image,
    margin_x: float,
    margin_top: float,
    margin_bottom: float,
) -> Image.Image:
    """Recadre le centre de la tuile (evite labels en bas + bords 3D)."""
    tw, th = tile.size
    left = int(tw * margin_x)
    right = int(tw * (1.0 - margin_x))
    top = int(th * margin_top)
    bottom = int(th * (1.0 - margin_bottom))
    inner = tile.crop((left, top, right, bottom))
    iw, ih = inner.size
    side = min(iw, ih)
    cx = (iw - side) // 2
    cy = (ih - side) // 2
    return inner.crop((cx, cy, cx + side, cy + side)).convert("RGBA")


def margins_for(name: str, args) -> tuple[float, float, float]:
    overrides = TILE_MARGINS.get(name, {})
    return (
        overrides.get("margin_x", args.margin_x),
        overrides.get("margin_top", args.margin_top),
        overrides.get("margin_bottom", args.margin_bottom),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Decoupe planche terrain ChatGPT")
    parser.add_argument("--src", default=DEFAULT_SRC, help="PNG planche")
    parser.add_argument("--size", type=int, default=64, help="Taille sortie carree")
    parser.add_argument("--margin-x", type=float, default=0.18, help="Marge laterale (ratio)")
    parser.add_argument("--margin-top", type=float, default=0.12, help="Marge haut (ratio)")
    parser.add_argument("--margin-bottom", type=float, default=0.38, help="Marge bas — labels")
    parser.add_argument("--preview", action="store_true", help="Sauvegarde apercu par tuile")
    args = parser.parse_args()

    if not os.path.isfile(args.src):
        print(f"Source introuvable : {args.src}", file=sys.stderr)
        return 1

    sheet = Image.open(args.src).convert("RGBA")
    sw, sh = sheet.size
    tile_rows = detect_tile_rows(sheet)

    os.makedirs(OUT_DIR, exist_ok=True)
    preview_dir = os.path.join(ROOT, "assets", "source", "chatgpt_terrain_preview")
    if args.preview:
        os.makedirs(preview_dir, exist_ok=True)

    print(f"Source : {args.src} ({sw}x{sh})")
    print(f"Sortie : {OUT_DIR} ({args.size}x{args.size})")
    print(f"Marges defaut : x={args.margin_x}, top={args.margin_top}, bottom={args.margin_bottom}\n")

    count = 0
    for row_i, boxes in enumerate(tile_rows):
        names = ROW_NAMES[row_i] if row_i < len(ROW_NAMES) else []
        if len(boxes) != len(names):
            print(
                f"ATTENTION ligne {row_i} : {len(boxes)} tuiles detectees, "
                f"{len(names)} noms attendus",
                file=sys.stderr,
            )
        for j, box in enumerate(boxes):
            if j >= len(names):
                break
            name = names[j]
            cell = sheet.crop(box)
            mx, mt, mb = margins_for(name, args)
            tex = extract_center_texture(cell, mx, mt, mb)
            out = tex.resize((args.size, args.size), Image.Resampling.LANCZOS)
            out.save(os.path.join(OUT_DIR, f"{name}.png"), "PNG")
            print(
                f"  {name}.png  <- bbox {box}  crop {tex.size[0]}x{tex.size[1]}"
                + (f"  (marges top={mt}, bottom={mb})" if name in TILE_MARGINS else "")
            )
            count += 1
            if args.preview:
                preview = Image.new(
                    "RGBA",
                    (cell.width, cell.height + cell.width + 8),
                    (32, 32, 32, 255),
                )
                preview.paste(cell, (0, 0))
                preview.paste(
                    tex.resize((cell.width, cell.width), Image.Resampling.LANCZOS),
                    (0, cell.height + 8),
                )
                preview.save(os.path.join(preview_dir, f"{name}_preview.png"))

    print(f"\n{count} textures deployees. Ctrl+F5 dans le navigateur.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
