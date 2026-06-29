"""
Importe les textures plates ComfyUI (512×512) vers le jeu (64×64 par défaut).

Workflow :
  1. Exporter depuis ComfyUI dans assets/textures/flat/source/
     Ex. grass_top.png, dirt.png, stone.png, sand_top.png, sand.png, forest_top.png
  2. python tools/import_flat_textures.py
  3. Ctrl+F5 dans le jeu

Options :
  --size 64          Taille de sortie (px) — doit correspondre à TERRAIN_FLAT_FACE_PX
  --source-size 512  Taille attendue en entrée (info seulement)
  --placeholders     Génère des carrés de test si source/ est vide
  --force            Réécrit les PNG déjà présents dans game/
"""

from __future__ import annotations

import argparse
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "assets", "textures", "flat", "source")
GAME_DIR = os.path.join(ROOT, "assets", "textures", "flat", "game")

# Noms attendus par TERRAIN_BLOCK_FACES (config.js)
EXPECTED_FACES = [
    "grass_top",
    "forest_top",
    "sand_top",
    "sand",
    "dirt",
    "stone",
]

PLACEHOLDER_COLORS = {
    "grass_top": (126, 170, 95),
    "forest_top": (82, 122, 60),
    "sand_top": (232, 212, 168),
    "sand": (201, 176, 132),
    "dirt": (154, 122, 82),
    "stone": (181, 176, 162),
}


def center_crop_square(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    s = min(w, h)
    left = (w - s) // 2
    top = (h - s) // 2
    return im.crop((left, top, left + s, top + s))


def resize_face(im: Image.Image, out_px: int) -> Image.Image:
    im = center_crop_square(im)
    return im.resize((out_px, out_px), Image.Resampling.LANCZOS)


def write_placeholder(name: str, out_px: int) -> Image.Image:
    base = PLACEHOLDER_COLORS.get(name, (140, 140, 140))
    im = Image.new("RGBA", (out_px, out_px), base + (255,))
    draw = ImageDraw.Draw(im)
    rng = random.Random(hash(name) & 0xFFFFFFFF)
    for _ in range(out_px * 2):
        x, y = rng.randint(0, out_px - 1), rng.randint(0, out_px - 1)
        d = rng.randint(-18, 18)
        r = max(0, min(255, base[0] + d))
        g = max(0, min(255, base[1] + d))
        b = max(0, min(255, base[2] + d))
        im.putpixel((x, y), (r, g, b, 255))
    im = im.filter(ImageFilter.GaussianBlur(radius=max(0.4, out_px / 64)))
    return im


def import_one(src_path: str, dst_path: str, out_px: int) -> None:
    im = Image.open(src_path)
    out = resize_face(im, out_px)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    out.save(dst_path, "PNG")
    print(f"  {os.path.basename(src_path)} -> {os.path.relpath(dst_path, ROOT)} ({out_px}x{out_px})")


def main() -> int:
    parser = argparse.ArgumentParser(description="Import textures plates Comfy -> jeu")
    parser.add_argument("--size", type=int, default=64, help="Taille sortie (px)")
    parser.add_argument("--source-size", type=int, default=512, help="Taille Comfy attendue")
    parser.add_argument("--placeholders", action="store_true", help="Générer des placeholders")
    parser.add_argument("--force", action="store_true", help="Écraser game/ existant")
    args = parser.parse_args()

    os.makedirs(SOURCE_DIR, exist_ok=True)
    os.makedirs(GAME_DIR, exist_ok=True)

    src_files = {
        os.path.splitext(f)[0]: os.path.join(SOURCE_DIR, f)
        for f in os.listdir(SOURCE_DIR)
        if f.lower().endswith(".png")
    }

    if not src_files and not args.placeholders:
        print(f"Aucun PNG dans {SOURCE_DIR}")
        print("Place tes exports Comfy 512×512 ici, ou relance avec --placeholders")
        print("\nNoms attendus :")
        for n in EXPECTED_FACES:
            print(f"  - {n}.png")
        return 1

    print(f"Import faces -> {GAME_DIR} ({args.size}x{args.size})")
    for name in EXPECTED_FACES:
        dst = os.path.join(GAME_DIR, f"{name}.png")
        if os.path.isfile(dst) and not args.force and name not in src_files:
            print(f"  (skip) {name}.png déjà présent")
            continue
        if name in src_files:
            import_one(src_files[name], dst, args.size)
            sw, sh = Image.open(src_files[name]).size
            if sw != args.source_size or sh != args.source_size:
                print(f"    note: source {sw}x{sh} (attendu ~{args.source_size})")
        elif args.placeholders:
            out = write_placeholder(name, args.size)
            out.save(dst, "PNG")
            print(f"  (placeholder) {name}.png")
        else:
            print(f"  (manquant) {name}.png — placeholder couleur en jeu")

    print("\nPret. Ctrl+F5 + nouvelle partie dans le navigateur.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
