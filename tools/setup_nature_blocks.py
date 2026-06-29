"""
Normalise les blocs 3D du pack isometric-nature vers assets/tiles/blocks/.
Même ancrage iso (_ISO_TOP) pour tous les sprites — aligné sur la grille jeu.

Usage :
  python tools/setup_nature_blocks.py
  python tools/setup_nature_blocks.py "C:/Users/.../isometric-nature-pack.rar"
"""

from __future__ import annotations

import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RAR = os.path.expanduser(r"~\Downloads\isometric-nature-pack.rar")
EXTRACT_CACHE = os.path.join(ROOT, "tools", "_nature_pack_extract")
OUT_DIR = os.path.join(ROOT, "assets", "tiles", "blocks")

# Géométrie iso du pack (identique à extract_cliffs_from_nature_pack.py)
_ISO_TOP = (0.500, 0.046)
_ISO_BOTTOM = (0.500, 0.962)
BG_THRESHOLD = 22
OUT_W = 130

BLOCK_SOURCES = {
    "grass": "grass1.png",
    "dirt": "dirt1.png",
    "stone": "stone1.png",
    "sand": "dirt2.png",
    "forest": "grass3.png",
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


def extract_rar(rar_path: str, dest_dir: str) -> None:
    os.makedirs(dest_dir, exist_ok=True)
    if os.path.isfile(os.path.join(dest_dir, "grass1.png")):
        return
    seven_zip = find_7z()
    if not seven_zip:
        raise SystemExit(f"7-Zip introuvable. Extrais le RAR dans {dest_dir}")
    print(f"Extraction RAR -> {dest_dir}")
    subprocess.run([seven_zip, "x", "-y", f"-o{dest_dir}", rar_path], check=True, capture_output=True)


def normalize_block(src: Image.Image) -> Image.Image:
    """Redimensionne à OUT_W de large, ancrage iso top au même Y relatif."""
    src = defringe_black(src)
    sw, sh = src.size
    scale = OUT_W / sw
    new_h = max(1, int(round(sh * scale)))
    resized = src.resize((OUT_W, new_h), Image.Resampling.LANCZOS)

    # Canvas avec pied au bas du bloc (bottom iso à OUT_W/2, new_h)
    top_y = int(round(_ISO_TOP[1] * new_h))
    bottom_y = int(round(_ISO_BOTTOM[1] * new_h))
    canvas_h = bottom_y + 2
    canvas = Image.new("RGBA", (OUT_W, canvas_h), (0, 0, 0, 0))
    # Décaler pour que le pied touche le bas du canvas
    paste_y = canvas_h - bottom_y - 1
    canvas.paste(resized, (0, paste_y), resized)
    return defringe_black(canvas)


def main() -> None:
    rar = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_RAR
    if os.path.isfile(rar):
        extract_rar(rar, EXTRACT_CACHE)

    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Sortie -> {OUT_DIR}")

    for name, filename in BLOCK_SOURCES.items():
        src_path = os.path.join(EXTRACT_CACHE, filename)
        if not os.path.isfile(src_path):
            print(f"  SKIP {name} ({filename} absent)")
            continue
        block = normalize_block(Image.open(src_path))
        out_path = os.path.join(OUT_DIR, f"{name}.png")
        block.save(out_path, optimize=True)
        print(f"  OK  {name}.png ({block.size[0]}x{block.size[1]})")

    print("Termine.")


if __name__ == "__main__":
    main()
