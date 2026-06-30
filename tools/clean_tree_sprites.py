#!/usr/bin/env python3
"""Nettoie les sprites d'arbres : fond blanc/noir → transparent + anti-halo."""

from __future__ import annotations

import argparse
import collections
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIR = ROOT / "assets" / "trees"

TREE_FILES = [
    "tree_green.png",
    "tree_flower.png",
    "tree_pine_dark.png",
    "tree_pine_tall.png",
    "tree_autumn.png",
    "tree_teal.png",
    "tree_purple.png",
    "tree_cedar.png",
]


def whiteness(r: int, g: int, b: int) -> int:
    return min(r, g, b)


def saturation(r: int, g: int, b: int) -> int:
    return max(r, g, b) - min(r, g, b)


def is_black(r: int, g: int, b: int, a: int, black_threshold: int) -> bool:
    return a < 12 or (r <= black_threshold and g <= black_threshold and b <= black_threshold)


def is_white_core(r: int, g: int, b: int, a: int, white_threshold: int) -> bool:
    if a < 12:
        return True
    w = whiteness(r, g, b)
    sat = saturation(r, g, b)
    return w >= white_threshold and sat <= 40


def is_white_soft(r: int, g: int, b: int, a: int, white_threshold: int, soft_range: int) -> bool:
    if a < 12:
        return True
    w = whiteness(r, g, b)
    sat = saturation(r, g, b)
    low = white_threshold - soft_range
    return w >= low and sat <= 55


def flood_remove_background(im: Image.Image, white_threshold: int, black_threshold: int) -> Image.Image:
    """Retire le fond noir/blanc connecté aux bords."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited = [[False] * w for _ in range(h)]
    q: collections.deque[tuple[int, int]] = collections.deque()

    def bg(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return is_black(r, g, b, a, black_threshold) or is_white_core(r, g, b, a, white_threshold)

    for x in range(w):
        for y in (0, h - 1):
            if bg(x, y):
                visited[y][x] = True
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y][x] and bg(x, y):
                visited[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx] and bg(nx, ny):
                visited[ny][nx] = True
                q.append((nx, ny))

    return im


def strip_edge_soft(im: Image.Image, white_threshold: int, soft_range: int, max_depth: int) -> Image.Image:
    """Retire les halos clairs connectés aux bords (alpha dégradé puis purge)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited: set[tuple[int, int]] = set()
    stack: list[tuple[int, int, int]] = []

    def classify(x: int, y: int) -> str | None:
        r, g, b, a = px[x, y]
        if a < 8:
            return None
        if is_white_core(r, g, b, a, white_threshold):
            return "core"
        if is_white_soft(r, g, b, a, white_threshold, soft_range):
            return "soft"
        return None

    for x in range(w):
        for y in (0, h - 1):
            if classify(x, y):
                stack.append((x, y, 0))
        for y in range(1, h - 1):
            pass
    for y in range(h):
        for x in (0, w - 1):
            if classify(x, y):
                stack.append((x, y, 0))

    while stack:
        x, y, depth = stack.pop()
        if (x, y) in visited:
            continue
        kind = classify(x, y)
        if kind is None or (kind == "soft" and depth > max_depth):
            continue
        visited.add((x, y))
        r, g, b, a = px[x, y]
        wv = whiteness(r, g, b)
        if wv >= white_threshold:
            px[x, y] = (0, 0, 0, 0)
        else:
            low = white_threshold - soft_range
            ratio = max(0.0, min(1.0, (wv - low) / max(1, soft_range)))
            new_a = int(a * (1.0 - ratio * 0.95))
            px[x, y] = (r, g, b, new_a)
        next_depth = 0 if kind == "core" else depth + 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                stack.append((nx, ny, next_depth))

    return im


def cleanup_fringe(im: Image.Image, white_threshold: int, passes: int = 4) -> Image.Image:
    """Plusieurs passes : pixels clairs voisins du transparent → alpha 0."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size

    for _ in range(passes):
        to_clear: list[tuple[int, int]] = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a < 16:
                    continue
                wv = whiteness(r, g, b)
                sat = saturation(r, g, b)
                if wv < white_threshold - 40 or sat > 70:
                    continue
                neighbor_transparent = False
                for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, -1), (-1, 1), (1, 1)):
                    nx, ny = x + dx, y + dy
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        neighbor_transparent = True
                        break
                    if px[nx, ny][3] < 16:
                        neighbor_transparent = True
                        break
                if neighbor_transparent:
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)

    return im


def purge_near_white(im: Image.Image, threshold: int) -> Image.Image:
    """Supprime les pixels quasi-blancs / gris clair restants (artefacts isolés)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            wv = whiteness(r, g, b)
            sat = saturation(r, g, b)
            avg = (r + g + b) / 3
            on_edge = x == 0 or y == 0 or x == w - 1 or y == h - 1

            if wv >= threshold and sat <= 50:
                px[x, y] = (0, 0, 0, 0)
            elif wv >= threshold - 25 and sat <= 35:
                px[x, y] = (0, 0, 0, 0)
            elif wv >= 145 and sat <= 55:
                px[x, y] = (0, 0, 0, 0)
            elif avg >= 165 and sat <= 70:
                px[x, y] = (0, 0, 0, 0)
            elif on_edge and wv >= 130 and sat <= 65:
                px[x, y] = (0, 0, 0, 0)
            elif on_edge and a < 180 and wv >= 120:
                px[x, y] = (0, 0, 0, 0)
    return im


def defringe_alpha(im: Image.Image) -> Image.Image:
    """Force alpha=0 sur les pixels quasi-transparents restants."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 48:
                px[x, y] = (0, 0, 0, 0)
            elif a < 96:
                wv = whiteness(r, g, b)
                if wv >= 140 and saturation(r, g, b) <= 60:
                    px[x, y] = (0, 0, 0, 0)
    return im


def trim_transparent(im: Image.Image) -> Image.Image:
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def clean_tree_sprite(
    im: Image.Image,
    *,
    white_threshold: int = 210,
    black_threshold: int = 22,
    soft_range: int = 70,
    max_depth: int = 28,
    scale: float = 1.0,
) -> Image.Image:
    im = flood_remove_background(im, white_threshold, black_threshold)
    im = strip_edge_soft(im, white_threshold, soft_range, max_depth)
    im = cleanup_fringe(im, white_threshold, passes=5)
    im = purge_near_white(im, white_threshold - 5)
    im = cleanup_fringe(im, white_threshold - 10, passes=2)
    im = defringe_alpha(im)
    im = trim_transparent(im)
    if scale != 1.0:
        nw = max(1, int(round(im.size[0] * scale)))
        nh = max(1, int(round(im.size[1] * scale)))
        im = im.resize((nw, nh), Image.LANCZOS)
    return im


def main() -> None:
    parser = argparse.ArgumentParser(description="Nettoie les sprites d'arbres (fond blanc → transparent).")
    parser.add_argument("--dir", type=Path, default=DEFAULT_DIR)
    parser.add_argument("--white", type=int, default=210, help="Seuil blanc (min RGB)")
    parser.add_argument("--scale", type=float, default=1.0, help="Facteur de redimensionnement final")
    args = parser.parse_args()

    for name in TREE_FILES:
        path = args.dir / name
        if not path.exists():
            print(f"SKIP {name} (introuvable)")
            continue
        before = Image.open(path)
        after = clean_tree_sprite(
            before,
            white_threshold=args.white,
            scale=args.scale,
        )
        after.save(path)
        print(f"{name}: {before.size} -> {after.size}")


if __name__ == "__main__":
    main()
