#!/usr/bin/env python3
"""Copie les textures seamless 1024×1024 vers assets/tiles/seamless/."""

from __future__ import annotations

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "textures_source")
DST = os.path.join(ROOT, "assets", "tiles", "seamless")

NAMES = (
    "grass",
    "sand",
    "water",
    "wheat",
    "rock",
    "marble",
    "hill",
    "wood_planks",
)


def main() -> None:
    os.makedirs(DST, exist_ok=True)
    for name in NAMES:
        src = os.path.join(SRC, f"{name}.png")
        if not os.path.isfile(src):
            print(f"  SKIP  {name}.png (absent dans textures_source)")
            continue
        shutil.copy2(src, os.path.join(DST, f"{name}.png"))
        print(f"  OK    {name}.png")
    print(f"Sortie : {DST}")


if __name__ == "__main__":
    main()
