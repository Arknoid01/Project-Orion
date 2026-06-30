#!/usr/bin/env python3
"""Réchauffe la palette des tuiles terrain (herbe sèche, eau turquoise, sable ocre)."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TILES = ROOT / "assets" / "tiles"


def _clamp(arr, lo=0, hi=255):
    return np.clip(arr, lo, hi).astype(np.uint8)


def warm_terrain_rgb(r, g, b, kind):
    rf, gf, bf = r.astype(float), g.astype(float), b.astype(float)

    if kind == "water":
        rf = rf * 0.72 + 40
        gf = gf * 0.95 + 24
        bf = bf * 1.08 + 18
    elif kind == "sand":
        rf = rf * 1.08 + 14
        gf = gf * 1.02 + 6
        bf = bf * 0.82
    elif kind == "grass":
        rf = rf * 1.12 + 18
        gf = gf * 0.92 + 4
        bf = bf * 0.78 - 6
    elif kind == "forest":
        rf = rf * 1.06 + 10
        gf = gf * 0.88 + 2
        bf = bf * 0.80 - 4
    elif kind == "hill":
        rf = rf * 1.10 + 12
        gf = gf * 0.90 + 2
        bf = bf * 0.78 - 4
    elif kind == "wheat":
        rf = rf * 1.06 + 8
        gf = gf * 0.96 + 2
        bf = bf * 0.86
    elif kind == "marble":
        rf = rf * 1.04 + 10
        gf = gf * 1.02 + 8
        bf = bf * 0.96 + 4
    elif kind == "rock":
        rf = rf * 1.06 + 12
        gf = gf * 1.02 + 8
        bf = bf * 0.92 + 2
    else:
        rf = rf * 1.04 + 6
        gf = gf * 1.00
        bf = bf * 0.92

    return _clamp(rf), _clamp(gf), _clamp(bf)


def process(path: Path, kind: str):
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    alpha = arr[:, :, 3]
    visible = alpha > 8
    if not visible.any():
        return False

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    nr, ng, nb = warm_terrain_rgb(r, g, b, kind)
    arr[:, :, 0] = np.where(visible, nr, r)
    arr[:, :, 1] = np.where(visible, ng, g)
    arr[:, :, 2] = np.where(visible, nb, b)
    Image.fromarray(arr).save(path)
    return True


def main():
    targets = [
        (TILES / "grass.png", "grass"),
        (TILES / "forest.png", "forest"),
        (TILES / "hill.png", "hill"),
        (TILES / "sand.png", "sand"),
        (TILES / "water.png", "water"),
        (TILES / "wheat.png", "wheat"),
        (TILES / "marble.png", "marble"),
        (TILES / "rock.png", "rock"),
        (TILES / "blocks" / "grass.png", "grass"),
        (TILES / "blocks" / "forest.png", "forest"),
        (TILES / "blocks" / "sand.png", "sand"),
        (TILES / "blocks" / "dirt.png", "sand"),
        (TILES / "blocks" / "stone.png", "rock"),
    ]
    n = 0
    for path, kind in targets:
        if path.exists() and process(path, kind):
            print(f"  warmed {path.relative_to(ROOT)} ({kind})")
            n += 1
    print(f"\n{n} tuiles réchauffées.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
