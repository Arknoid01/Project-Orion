"""
Importe tiles_pretes.zip (tuiles iso plates 64×32) dans le projet.

Usage :
  python tools/import_tiles_pretes.py chemin/vers/tiles_pretes.zip
  python tools/import_tiles_pretes.py   # défaut : ~/Downloads/tiles_pretes.zip
"""

import os
import shutil
import sys
import zipfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VARIANTS_DIR = os.path.join(ROOT, "assets", "textures_source", "tiles_pretes")
OUT_DIR = os.path.join(ROOT, "assets", "tiles")
BG_THRESHOLD = 22
TILE_W = 64
TILE_H = 32
# Les PNG du zip sont plus petits que le losange grille : on agrandit pour couvrir les pointes.
ISO_EXPAND_PAD = 1.08

# Tuile jeu ← fichier source (premier choix pour assets/tiles/)
PRIMARY_MAP = {
    "grass.png": "grass1.png",
    "sand.png": "dirt1.png",
    "marble.png": "marble1.png",
    "wheat.png": "wheat1.png",
    "forest.png": "grass8.png",
    "hill.png": "dirt2.png",
}


def defringe_black(im, threshold=BG_THRESHOLD):
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


def expand_iso_diamond_tile(im, tw=TILE_W, th=TILE_H, pad=ISO_EXPAND_PAD):
    """Agrandit la tuile pour que le losange remplisse 64×32 (évite les trous noirs)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    cy = h // 2
    xs = [x for x in range(w) if px[x, cy][3] > 128]
    if not xs:
        return im
    span = xs[-1] - xs[0] + 1
    scale = (tw / span) * pad
    nw = max(1, int(w * scale))
    nh = max(1, int(h * scale))
    scaled = im.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(scaled, ((tw - nw) // 2, (th - nh) // 2), scaled)
    return out


def prepare_tile(im):
    return expand_iso_diamond_tile(defringe_black(im))


def extract_zip(zip_path, dest_dir):
    os.makedirs(dest_dir, exist_ok=True)
    names = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".png"):
                continue
            name = os.path.basename(info.filename)
            out = os.path.join(dest_dir, name)
            with zf.open(info) as src:
                tile = prepare_tile(Image.open(src))
            tile.save(out)
            names.append(name)
    return sorted(names)


def main():
    zip_path = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
        r"~\Downloads\tiles_pretes.zip"
    )
    if not os.path.isfile(zip_path):
        raise SystemExit(f"Archive introuvable : {zip_path}")

    print(f"Import depuis {zip_path}")
    names = extract_zip(zip_path, VARIANTS_DIR)
    print(f"  {len(names)} variantes -> {VARIANTS_DIR}")

    os.makedirs(OUT_DIR, exist_ok=True)
    for dest_name, src_name in PRIMARY_MAP.items():
        src = os.path.join(VARIANTS_DIR, src_name)
        if not os.path.isfile(src):
            print(f"  SKIP {dest_name} (manque {src_name})")
            continue
        tile = prepare_tile(Image.open(src))
        out = os.path.join(OUT_DIR, dest_name)
        tile.save(out)
        print(f"  OK  {dest_name} <- {src_name} ({tile.size[0]}×{tile.size[1]})")

    print("\nEau / roche / route : fichiers existants conservés dans assets/tiles/.")
    print("Terminé. Recharge le jeu (Ctrl+F5).")


if __name__ == "__main__":
    main()
