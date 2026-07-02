"""
Importe les textures carrées ComfyUI vers le jeu (cubes Three.js Minecraft-style).

Workflow :
  1. python tools/comfy_terrain_batch.py
     → PNG 1024×1024 dans assets/textures/flat/source/
  2. python tools/import_flat_textures.py --deploy-three
     → carrés 64×64 dans assets/tiles/generated_mediterranean/
  3. Ctrl+F5 dans le navigateur

Options :
  --size 64              Taille de sortie (px, carré)
  --deploy-three         Déploie vers assets/tiles/generated_mediterranean/ (défaut)
  --legacy-flat          Ancien chemin assets/textures/flat/game/ (mode 2D iso)
  --placeholders         Génère des carrés de test si source/ est vide
  --force                Réécrit les PNG déjà présents
  --check                Vérifie que toutes les textures requises existent (exit 1 si manque)
"""

from __future__ import annotations

import argparse
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE_DIR = os.path.join(ROOT, "assets", "textures", "flat", "source")
THREE_DIR = os.path.join(ROOT, "assets", "tiles", "generated_mediterranean")
LEGACY_FLAT_DIR = os.path.join(ROOT, "assets", "textures", "flat", "game")

# Textures cubes Three.js (threeRenderer.js THREE_TERRAIN_TEX_DEFS)
THREE_TEXTURES = [
    "grass",
    "forest",
    "wheat",
    "sand",
    "dirt",
    "rock",
    "marble",
    "water",
]

# Noms legacy mode 2D flat (config.js TERRAIN_BLOCK_FACES)
LEGACY_FLAT_MAP = {
    "grass_top": "grass",
    "forest_top": "forest",
    "sand_top": "sand",
    "sand": "sand",
    "dirt": "dirt",
    "stone": "marble",
}

PLACEHOLDER_COLORS = {
    "grass": (126, 170, 95),
    "forest": (82, 122, 60),
    "wheat": (210, 180, 70),
    "sand": (232, 212, 168),
    "dirt": (154, 122, 82),
    "rock": (140, 135, 125),
    "marble": (220, 216, 204),
    "water": (58, 134, 200),
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
    rng = random.Random(hash(name) & 0xFFFFFFFF)
    for _ in range(out_px * 2):
        x, y = rng.randint(0, out_px - 1), rng.randint(0, out_px - 1)
        d = rng.randint(-18, 18)
        r = max(0, min(255, base[0] + d))
        g = max(0, min(255, base[1] + d))
        b = max(0, min(255, base[2] + d))
        im.putpixel((x, y), (r, g, b, 255))
    return im.filter(ImageFilter.GaussianBlur(radius=max(0.4, out_px / 64)))


def import_one(src_path: str, dst_path: str, out_px: int) -> None:
    im = Image.open(src_path)
    out = resize_face(im, out_px)
    os.makedirs(os.path.dirname(dst_path), exist_ok=True)
    out.save(dst_path, "PNG")
    print(f"  {os.path.basename(src_path)} -> {os.path.relpath(dst_path, ROOT)} ({out_px}x{out_px})")


def list_source_files() -> dict[str, str]:
    if not os.path.isdir(SOURCE_DIR):
        return {}
    return {
        os.path.splitext(f)[0]: os.path.join(SOURCE_DIR, f)
        for f in os.listdir(SOURCE_DIR)
        if f.lower().endswith(".png")
    }


def deploy_three(src_files: dict[str, str], out_px: int, force: bool, placeholders: bool) -> int:
    os.makedirs(THREE_DIR, exist_ok=True)
    print(f"Déploiement Three.js -> {THREE_DIR} ({out_px}x{out_px} carré)")
    missing = []
    for name in THREE_TEXTURES:
        dst = os.path.join(THREE_DIR, f"{name}.png")
        if os.path.isfile(dst) and not force and name not in src_files:
            print(f"  (skip) {name}.png déjà présent")
            continue
        if name in src_files:
            import_one(src_files[name], dst, out_px)
            sw, sh = Image.open(src_files[name]).size
            if sw != sh:
                print(f"    note: source non carrée {sw}x{sh} — recadrage centré appliqué")
        elif placeholders:
            write_placeholder(name, out_px).save(dst, "PNG")
            print(f"  (placeholder) {name}.png")
        else:
            missing.append(name)
            print(f"  (manquant) {name}.png")
    if missing:
        print(f"\nManquants : {', '.join(missing)}")
        print("Relance comfy_terrain_batch.py ou --placeholders")
        return 1
    print("\nPrêt. Ctrl+F5 + nouvelle partie.")
    return 0


def deploy_legacy_flat(src_files: dict[str, str], out_px: int, force: bool, placeholders: bool) -> int:
    os.makedirs(LEGACY_FLAT_DIR, exist_ok=True)
    print(f"Déploiement legacy flat -> {LEGACY_FLAT_DIR} ({out_px}x{out_px})")
    for legacy_name, source_name in LEGACY_FLAT_MAP.items():
        dst = os.path.join(LEGACY_FLAT_DIR, f"{legacy_name}.png")
        if os.path.isfile(dst) and not force and source_name not in src_files:
            print(f"  (skip) {legacy_name}.png")
            continue
        if source_name in src_files:
            import_one(src_files[source_name], dst, out_px)
        elif placeholders:
            write_placeholder(source_name, out_px).save(dst, "PNG")
            print(f"  (placeholder) {legacy_name}.png <- {source_name}")
        else:
            print(f"  (manquant) {legacy_name}.png <- {source_name}")
    return 0


def check_textures(deploy_three_mode: bool) -> int:
    target_dir = THREE_DIR if deploy_three_mode else LEGACY_FLAT_DIR
    expected = THREE_TEXTURES if deploy_three_mode else list(LEGACY_FLAT_MAP.keys())
    print(f"Vérification {target_dir}:")
    ok = True
    for name in expected:
        fname = f"{name}.png"
        path = os.path.join(target_dir, fname)
        if not os.path.isfile(path):
            print(f"  MANQUE  {fname}")
            ok = False
            continue
        im = Image.open(path)
        w, h = im.size
        square = "OK" if w == h else f"NON CARRÉ {w}x{h}"
        print(f"  OK      {fname} ({w}x{h}) {square}")
    return 0 if ok else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Import textures Comfy carrées -> jeu Three.js")
    parser.add_argument("--size", type=int, default=64, help="Taille sortie carrée (px)")
    parser.add_argument("--legacy-flat", action="store_true", help="Vers textures/flat/game/ (ancien mode 2D)")
    parser.add_argument("--placeholders", action="store_true", help="Générer des placeholders")
    parser.add_argument("--force", action="store_true", help="Écraser les PNG existants")
    parser.add_argument("--check", action="store_true", help="Vérifier les textures déployées")
    args = parser.parse_args()

    deploy_three_mode = not args.legacy_flat

    if args.check:
        return check_textures(deploy_three_mode)

    os.makedirs(SOURCE_DIR, exist_ok=True)
    src_files = list_source_files()

    if not src_files and not args.placeholders:
        print(f"Aucun PNG dans {SOURCE_DIR}")
        print("Lance d'abord : python tools/comfy_terrain_batch.py")
        print("\nTextures attendues (source/) :")
        for n in THREE_TEXTURES:
            print(f"  - {n}.png")
        return 1

    if args.legacy_flat:
        return deploy_legacy_flat(src_files, args.size, args.force, args.placeholders)
    return deploy_three(src_files, args.size, args.force, args.placeholders)


if __name__ == "__main__":
    sys.exit(main())
