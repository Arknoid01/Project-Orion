"""
Extrait les falaises iso depuis le pack « isometric-nature-pack » (RAR)
et produit les 8 tuiles cliff_*.png pour Olympos.

Le bloc 3D grass1.png du pack fournit les parois terre (faces gauche/droite).
Sortie : parois seules (transparent), ancrage 64×48 aligné sur la grille.

Usage :
  python tools/extract_cliffs_from_nature_pack.py
  python tools/extract_cliffs_from_nature_pack.py "C:/Users/.../isometric-nature-pack.rar" --preview
"""

from __future__ import annotations

import os
import subprocess
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RAR = os.path.expanduser(r"~\Downloads\isometric-nature-pack.rar")
DEFAULT_BLOCK = "grass1.png"
OUT_DIR = os.path.join(ROOT, "assets", "textures_source", "cliffs")
EXTRACT_CACHE = os.path.join(ROOT, "tools", "_nature_pack_extract")

TILE_W = 64
TILE_H = 32
CLIFF_H = 48
BG_THRESHOLD = 22

# Géométrie iso normalisée du bloc nature-pack (130 px de référence).
_ISO_TOP = (0.500, 0.046)
_ISO_LEFT = (0.077, 0.308)
_ISO_RIGHT = (0.923, 0.308)
_ISO_FRONT = (0.500, 0.400)
_ISO_BOTTOM = (0.500, 0.962)
_ISO_FOOT_L = (0.000, 0.692)
_ISO_FOOT_R = (1.000, 0.692)

# Losange terrain : 0=haut, 1=droite, 2=bas, 3=gauche
_DIAMOND = [(TILE_W / 2, 0), (TILE_W, TILE_H / 2), (TILE_W / 2, TILE_H), (0, TILE_H / 2)]

# Masques par type de tuile : (v0,v1) bords + sommets à remplir
_CLIFF_MASKS = {
    "e":  {"edges": [(1, 2)], "verts": [1]},
    "s":  {"edges": [(2, 3)], "verts": [2]},
    "w":  {"edges": [(3, 0)], "verts": [3], "flip": True},
    "n":  {"edges": [(0, 1)], "verts": [0], "flip": True},
    "se": {"edges": [(1, 2), (2, 3)], "verts": [1, 2]},
    "sw": {"edges": [(2, 3), (1, 2)], "verts": [2, 3]},
    "ne": {"edges": [(0, 1), (1, 2)], "verts": [0, 1], "flip_n": True},
    "nw": {"edges": [(3, 0), (2, 3)], "verts": [3, 0], "flip": True},
}


def defringe_black(im: Image.Image, threshold: int = BG_THRESHOLD) -> Image.Image:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12 or (r <= threshold and g <= threshold and b <= threshold):
                px[x, y] = (0, 0, 0, 0)
            else:
                px[x, y] = (r, g, b, 255)
    return im


def find_7z() -> str | None:
    for path in (
        os.path.join(os.environ.get("ProgramFiles", ""), "7-Zip", "7z.exe"),
        os.path.join(os.environ.get("ProgramFiles(x86)", ""), "7-Zip", "7z.exe"),
    ):
        if path and os.path.isfile(path):
            return path
    return None


def extract_rar(rar_path: str, dest_dir: str) -> str:
    os.makedirs(dest_dir, exist_ok=True)
    block_path = os.path.join(dest_dir, DEFAULT_BLOCK)
    if os.path.isfile(block_path):
        return block_path
    seven_zip = find_7z()
    if not seven_zip:
        raise SystemExit(f"7-Zip introuvable. Extrais le RAR dans {dest_dir}")
    print(f"Extraction RAR -> {dest_dir}")
    subprocess.run([seven_zip, "x", "-y", f"-o{dest_dir}", rar_path], check=True, capture_output=True)
    if not os.path.isfile(block_path):
        raise SystemExit(f"Bloc {DEFAULT_BLOCK} absent apres extraction.")
    return block_path


def _scale_pt(x: float, y: float, w: int, h: int) -> tuple[float, float]:
    return x * w, y * h


def _point_in_poly(x: float, y: float, poly: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def _block_polygons(w: int, h: int):
    top = _scale_pt(*_ISO_TOP, w, h)
    left = _scale_pt(*_ISO_LEFT, w, h)
    right = _scale_pt(*_ISO_RIGHT, w, h)
    front = _scale_pt(*_ISO_FRONT, w, h)
    bottom = _scale_pt(*_ISO_BOTTOM, w, h)
    foot_l = _scale_pt(*_ISO_FOOT_L, w, h)
    foot_r = _scale_pt(*_ISO_FOOT_R, w, h)
    left_face = [left, front, bottom, foot_l]
    right_face = [right, front, bottom, foot_r]
    return left_face, right_face


def decompose_block(block: Image.Image) -> tuple[Image.Image, Image.Image]:
    block = defringe_black(block)
    w, h = block.size
    src = block.load()
    left_face_poly, right_face_poly = _block_polygons(w, h)
    left_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    right_img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    left_px = left_img.load()
    right_px = right_img.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = src[x, y]
            if a < 12:
                continue
            p = (x + 0.5, y + 0.5)
            if _point_in_poly(p[0], p[1], left_face_poly):
                left_px[x, y] = (r, g, b, a)
            elif _point_in_poly(p[0], p[1], right_face_poly):
                right_px[x, y] = (r, g, b, a)
    return left_img, right_img


def _face_atlas(left_face: Image.Image, right_face: Image.Image) -> Image.Image:
    """Atlas parois (gauche + droite superposées) redimensionné sur la tuile jeu."""
    w = max(left_face.width, right_face.width)
    h = max(left_face.height, right_face.height)
    atlas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    atlas.paste(left_face, (0, 0), left_face)
    atlas.paste(right_face, (0, 0), right_face)
    return defringe_black(atlas.resize((TILE_W, CLIFF_H), Image.Resampling.LANCZOS))


def _edge_wedge_mask(v0: int, v1: int, *, thickness: int = 30, overlap: int = 10) -> Image.Image:
    """Trapèze le long d'un bord du losange, déborde légèrement pour fermer les jointures."""
    mask = Image.new("L", (TILE_W, CLIFF_H), 0)
    draw = ImageDraw.Draw(mask)
    ax, ay = _DIAMOND[v0]
    bx, by = _DIAMOND[v1]
    cx, cy = TILE_W / 2, TILE_H / 2
    mx, my = (ax + bx) / 2, (ay + by) / 2
    dx, dy = mx - cx, my - cy
    norm = (dx * dx + dy * dy) ** 0.5 or 1.0
    ox, oy = dx / norm * overlap, dy / norm * overlap
    ex, ey = bx - ax, by - ay
    elen = (ex * ex + ey * ey) ** 0.5 or 1.0
    ex, ey = ex / elen * overlap, ey / elen * overlap
    ext_y = CLIFF_H + 4
    draw.polygon(
        [
            (ax - ex, ay - ey),
            (bx + ex, by + ey),
            (bx + ox * 2.8 + ex, ext_y),
            (ax + ox * 2.8 - ex, ext_y),
        ],
        fill=255,
    )
    draw.line([(ax, ay), (bx, by)], fill=255, width=thickness)
    return mask


def _vertex_patch_mask(vidx: int, radius: int = 14) -> Image.Image:
    """Remplit le sommet du losange (joint entre deux parois)."""
    mask = Image.new("L", (TILE_W, CLIFF_H), 0)
    draw = ImageDraw.Draw(mask)
    vx, vy = _DIAMOND[vidx]
    cx, cy = TILE_W / 2, TILE_H
    draw.polygon([(vx, vy), (cx, cy + 20), (vx + (cx - vx) * 0.35, vy + 18)], fill=255)
    draw.ellipse((vx - radius, vy - radius, vx + radius, vy + radius), fill=255)
    return mask


def _compose_mask(spec: dict) -> Image.Image:
    mask = Image.new("L", (TILE_W, CLIFF_H), 0)
    for v0, v1 in spec.get("edges", []):
        m = _edge_wedge_mask(v0, v1)
        mask = Image.composite(Image.new("L", (TILE_W, CLIFF_H), 255), mask, m)
    for vidx in spec.get("verts", []):
        m = _vertex_patch_mask(vidx)
        mask = Image.composite(Image.new("L", (TILE_W, CLIFF_H), 255), mask, m)
    return mask


def _paste_masked(atlas: Image.Image, mask: Image.Image) -> Image.Image:
    layer = Image.new("RGBA", (TILE_W, CLIFF_H), (0, 0, 0, 0))
    layer.paste(atlas, (0, 0), mask)
    return layer


def build_cliff_wall_only(left_face: Image.Image, right_face: Image.Image, name: str) -> Image.Image:
    atlas = _face_atlas(left_face, right_face)
    spec = _CLIFF_MASKS[name]
    canvas = Image.new("RGBA", (TILE_W, CLIFF_H), (0, 0, 0, 0))

    if spec.get("flip"):
        atlas = atlas.transpose(Image.FLIP_LEFT_RIGHT)

    if name == "ne":
        # côté N (miroir) + côté E (normal) — même atlas, deux masques
        m_n = _compose_mask({"edges": [(0, 1)], "verts": [0]})
        m_e = _compose_mask({"edges": [(1, 2)], "verts": [1]})
        atlas_flip = _face_atlas(left_face, right_face).transpose(Image.FLIP_LEFT_RIGHT)
        canvas = Image.alpha_composite(canvas, _paste_masked(atlas_flip, m_n))
        canvas = Image.alpha_composite(canvas, _paste_masked(atlas, m_e))
        return defringe_black(canvas)

    mask = _compose_mask(spec)
    canvas = Image.alpha_composite(canvas, _paste_masked(atlas, mask))
    return defringe_black(canvas)


def save_preview(tiles: dict[str, Image.Image], path: str):
    names = ["n", "e", "s", "w", "ne", "se", "sw", "nw"]
    sheet = Image.new("RGBA", (TILE_W * len(names), CLIFF_H), (0, 0, 0, 255))
    for i, key in enumerate(names):
        sheet.paste(tiles[key], (i * TILE_W, 0))
    sheet.save(path)
    print(f"  Apercu -> {path}")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Extrait cliff_*.png depuis isometric-nature-pack")
    parser.add_argument("rar", nargs="?", default=DEFAULT_RAR)
    parser.add_argument("--block", default=DEFAULT_BLOCK)
    parser.add_argument("--out", default=OUT_DIR)
    parser.add_argument("--extract-dir", default=EXTRACT_CACHE)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    block_path = extract_rar(args.rar, args.extract_dir)
    if args.block != DEFAULT_BLOCK:
        block_path = os.path.join(args.extract_dir, args.block)

    print(f"Bloc 3D : {block_path}")
    block = Image.open(block_path)
    bw = 128
    bh = max(1, int(block.height * (bw / block.width)))
    block = block.resize((bw, bh), Image.Resampling.LANCZOS)

    left_face, right_face = decompose_block(block)
    os.makedirs(args.out, exist_ok=True)
    tiles: dict[str, Image.Image] = {}
    for key in ("n", "e", "s", "w", "ne", "se", "sw", "nw"):
        tile = build_cliff_wall_only(left_face, right_face, key)
        out_path = os.path.join(args.out, f"cliff_{key}.png")
        tile.save(out_path)
        tiles[key] = tile
        print(f"  OK  cliff_{key}.png ({TILE_W}x{CLIFF_H})")

    if args.preview:
        save_preview(tiles, os.path.join(args.out, "cliffs_preview.png"))

    debug_dir = os.path.join(args.out, "_debug")
    os.makedirs(debug_dir, exist_ok=True)
    _face_atlas(left_face, right_face).save(os.path.join(debug_dir, "face_atlas.png"))

    print(f"\nTermine -> {args.out}")


if __name__ == "__main__":
    main()
