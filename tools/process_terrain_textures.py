"""
Convertit les textures de sol Olympos (1024×1024 PNG ou zip) en tuiles iso
64×32 logiques pour assets/tiles/ (export 128×64, réduit par le canvas).

Usage :
  python tools/process_terrain_textures.py OLYMPOS_TERRAIN_TEXTURES.zip
  python tools/process_terrain_textures.py assets/textures_source/*.png
  python tools/process_terrain_textures.py --from-preview chemin/vers/apercu.png

Ordre attendu dans le zip (8 fichiers, tri alphabétique ou noms explicites) :
  01_grass, 02_hill, 03_marble, 04_rock, 05_sand, 06_water, 07_road, 08_forest
Ou noms : grass, hill, marble, rock, sand, water, road/planks/cobble, forest/wheat
"""

import os
import random
import sys
import zipfile
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "tiles")
SRC_DIR = os.path.join(ROOT, "assets", "textures_source")

TILE_W = 64
TILE_H = 32
# Export 2× (128×64) : le canvas réduit avec antialiasing → plus net au zoom
EXPORT_SCALE = 2
DIAMOND_INSET = 1.0

# Ordre gauche→droite sur la planche « APERÇU TILING » (8 carrés)
PREVIEW_STRIP_NAMES = [
    "grass", "hill", "marble", "rock", "sand", "water", "wood_planks", "wheat",
]

# Fichiers jeu ← source (index dans PREVIEW_STRIP_NAMES ou nom de fichier zip)
GAME_TILE_SOURCES = {
    "grass":  "grass",
    "hill":   "hill",
    "marble": "marble",
    "rock":   "rock",
    "sand":   "sand",
    "water":  "water",
    "wheat":  "wheat",       # hautes herbes / épis
    "forest": "grass",       # sol herbeux + arbres procéduraux par-dessus
}

ROAD_OUT = "road.png"


def sample_bilinear(px, sn, u, v):
    """Échantillon bilinéaire sur texture carrée sn×sn (u,v dans [0,1])."""
    u = max(0.0, min(1.0, u)) * (sn - 1)
    v = max(0.0, min(1.0, v)) * (sn - 1)
    x0, y0 = int(u), int(v)
    x1, y1 = min(x0 + 1, sn - 1), min(y0 + 1, sn - 1)
    fx, fy = u - x0, v - y0

    def pix(x, y):
        return px[x, y]

    def lerp(a, b, t):
        return a + (b - a) * t

    def lerp_px(p0, p1, p2, p3):
        top = [lerp(p0[i], p1[i], fx) for i in range(4)]
        bot = [lerp(p2[i], p3[i], fx) for i in range(4)]
        return tuple(int(lerp(top[i], bot[i], fy)) for i in range(4))

    return lerp_px(pix(x0, y0), pix(x1, y0), pix(x0, y1), pix(x1, y1))


def enhance_square(im):
    """Retouche légère : contraste, saturation, netteté, suppression bords sombres."""
    im = im.convert("RGBA")
    side = min(im.size)
    if im.size[0] != side or im.size[1] != side:
        left = (im.size[0] - side) // 2
        top = (im.size[1] - side) // 2
        im = im.crop((left, top, left + side, top + side))

    px = im.load()
    # Recadre les bandes noires/sombres des planches marketing (~3 % par côté)
    margin = max(2, side // 32)
    inner = im.crop((margin, margin, side - margin, side - margin))
    im = inner.resize((side, side), Image.LANCZOS)
    del px

    rgb = im.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.06)
    rgb = ImageEnhance.Color(rgb).enhance(1.10)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.12)
    rgb = rgb.filter(ImageFilter.GaussianBlur(0.4))
    out = rgb.convert("RGBA")
    # Conserve l'alpha d'origine si présent
    if im.getextrema()[3][0] < 255:
        out.putalpha(im.split()[3])
    return out


def make_forest_variant(grass_square):
    """Forêt = herbe assombrie + bruit organique (distincte de grass.png)."""
    base = enhance_square(grass_square).convert("RGBA")
    px = base.load()
    side = base.size[0]
    rnd = random.Random(42)
    for y in range(side):
        for x in range(side):
            r, g, b, a = px[x, y]
            k = rnd.uniform(0.82, 0.96)
            px[x, y] = (int(r * k), int(g * k * 1.02), int(b * k * 0.88), a)
    return base


def make_iso_tile(img, w=None, h=None, inset=DIAMOND_INSET):
    """Projette la texture carrée sur un losange iso (UV + bilinéaire)."""
    if w is None:
        w = TILE_W * EXPORT_SCALE
    if h is None:
        h = TILE_H * EXPORT_SCALE

    src = img.convert("RGBA")
    side = min(src.size)
    if src.size[0] != side or src.size[1] != side:
        left = (src.size[0] - side) // 2
        top = (src.size[1] - side) // 2
        src = src.crop((left, top, left + side, top + side))

    spx = src.load()
    sn = side
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    cx, cy = w / 2, h / 2
    hw, hh = (w / 2) * inset, (h / 2) * inset

    for y in range(h):
        for x in range(w):
            dx = (x - cx) / hw if hw else 0
            dy = (y - cy) / hh if hh else 0
            if abs(dx) + abs(dy) > 1.0:
                continue
            u = (dx + dy + 2) / 4
            v = (dy - dx + 2) / 4
            opx[x, y] = sample_bilinear(spx, sn, u, v)

    return defringe_rgba(out)


def defringe_rgba(img, min_sum=24):
    """Supprime le halo noir sur les pixels semi-transparents (artefact de découpe)."""
    im = img.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0 or a == 255 or (r + g + b) >= min_sum:
                continue
            tr, tg, tb, tw = 0, 0, 0, 0
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    nr, ng, nb, na = px[nx, ny]
                    if na > 200:
                        tr += nr
                        tg += ng
                        tb += nb
                        tw += 1
            if tw:
                px[x, y] = (tr // tw, tg // tw, tb // tw, a)
    return im


def match_game_key(filename):
    base = os.path.splitext(os.path.basename(filename))[0].lower()
    hints = {
        "grass": ["grass", "01", "meadow", "herbe"],
        "hill": ["hill", "02", "pebble", "colline"],
        "marble": ["marble", "03", "stone", "marbre", "paving"],
        "rock": ["rock", "04", "cobble", "route"],
        "sand": ["sand", "05", "dirt", "sable"],
        "water": ["water", "06", "eau"],
        "wheat": ["wheat", "08", "ble", "reeds", "tall"],
        "forest": ["forest", "foret"],
        "wood_planks": ["wood", "07", "plank", "pontoon"],
    }
    for key, words in hints.items():
        if key in base:
            return key
        for w in words:
            if w in base:
                return key
    return None


def build_game_mapping(by_name):
    """Résout les 8 tuiles jeu à partir des sources extraites."""
    mapping = {}
    for game_key, src_key in GAME_TILE_SOURCES.items():
        if src_key in by_name:
            mapping[game_key] = by_name[src_key]
        elif game_key in by_name:
            mapping[game_key] = by_name[game_key]
        else:
            raise SystemExit(f"Texture source manquante pour '{game_key}' (attendu : {src_key})")
    return mapping


def assign_by_order(paths):
    paths = sorted(paths)
    if len(paths) < 8:
        raise SystemExit(f"8 textures attendues, {len(paths)} trouvée(s).")
    by_name = {PREVIEW_STRIP_NAMES[i]: paths[i] for i in range(8)}
    return build_game_mapping(by_name)


def assign_by_name(paths):
    by_name = {}
    for p in paths:
        key = match_game_key(p)
        if key:
            by_name[key] = p
    if len(by_name) < 7:
        return assign_by_order(paths)
    return build_game_mapping(by_name)


def load_square(path):
    im = Image.open(path).convert("RGBA")
    side = min(im.size)
    if im.size[0] != im.size[1]:
        left = (im.size[0] - side) // 2
        top = (im.size[1] - side) // 2
        im = im.crop((left, top, left + side, top + side))
    return im


def export_tiles(mapping):
    os.makedirs(OUT_DIR, exist_ok=True)
    out_w, out_h = TILE_W * EXPORT_SCALE, TILE_H * EXPORT_SCALE
    for game_key, src in mapping.items():
        square = load_square(src)
        if game_key == "forest":
            square = make_forest_variant(square)
        else:
            square = enhance_square(square)
        tile = make_iso_tile(square, out_w, out_h)
        out_name = f"{game_key}.png"
        out_path = os.path.join(OUT_DIR, out_name)
        tile.save(out_path)
        print(f"  OK  {out_name} ({out_w}×{out_h}) <- {os.path.basename(src)}")

    if "rock" in mapping:
        square = enhance_square(load_square(mapping["rock"]))
        road = make_iso_tile(square, out_w, out_h)
        road.save(os.path.join(OUT_DIR, ROAD_OUT))
        print(f"  OK  {ROAD_OUT} ({out_w}×{out_h}) <- {os.path.basename(mapping['rock'])} (cobblestone)")


def extract_from_preview(preview_path):
    """Extrait les 8 carrés de la bande « APERÇU TILING » d'une planche marketing."""
    im = Image.open(preview_path)
    w, h = im.size
    # Bande tiling : ~y 430–590 sur planche 1024×682
    y0, y1 = int(h * 0.63), int(h * 0.865)
    strip = im.crop((0, y0, w, y1))
    sh = strip.size[1]
    tw = w // 8
    os.makedirs(SRC_DIR, exist_ok=True)
    paths = []
    names = PREVIEW_STRIP_NAMES
    for i, name in enumerate(names):
        x0 = i * tw
        cell = strip.crop((x0, 0, x0 + tw, sh))
        side = min(cell.size)
        cx = (cell.size[0] - side) // 2
        cy = (cell.size[1] - side) // 2
        sq = cell.crop((cx, cy, cx + side, cy + side))
        # Upscale preview (~128px) → 1024 pour meilleure qualité iso
        sq = sq.resize((1024, 1024), Image.LANCZOS)
        out = os.path.join(SRC_DIR, f"{name}.png")
        sq.save(out)
        paths.append(out)
        print(f"  extrait {name}.png depuis la planche")
    return paths


def collect_from_zip(zip_path):
    os.makedirs(SRC_DIR, exist_ok=True)
    paths = []
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".png"):
                continue
            data = zf.read(info.filename)
            name = os.path.basename(info.filename)
            out = os.path.join(SRC_DIR, name)
            with open(out, "wb") as f:
                f.write(data)
            paths.append(out)
    return paths


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)

    paths = []
    if args[0] == "--from-preview":
        if len(args) < 2:
            raise SystemExit("Usage: --from-preview chemin/planche.png")
        paths = extract_from_preview(os.path.abspath(args[1]))
    elif os.path.isdir(os.path.abspath(args[0])):
        d = os.path.abspath(args[0])
        paths = sorted(
            os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png")
        )
    elif args[0].lower().endswith(".zip"):
        paths = collect_from_zip(os.path.abspath(args[0]))
    else:
        paths = [os.path.abspath(p) for p in args if p.lower().endswith(".png")]

    if not paths:
        raise SystemExit("Aucune texture PNG trouvée.")

    mapping = assign_by_name(paths)
    print(f"\nGeneration de {len(mapping)} tuiles iso -> {OUT_DIR}\n")
    export_tiles(mapping)
    print("\nTerminé. Recharge le jeu pour voir les nouveaux sols.")


if __name__ == "__main__":
    main()
