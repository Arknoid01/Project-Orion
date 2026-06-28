#!/usr/bin/env python3
"""
Découpe les feuilles ComfyUI (LoRA Walking_Sprite, 832×1216) en atlas jeu :
  3 colonnes (frames de marche) × 4 lignes (face, gauche, droite, dos)
  → assets/characters/walkers/{water,market,...}.png

Usage :
  python tools/slice_walker_sheets.py
  python tools/slice_walker_sheets.py --from sprites_out/characters/walkers
  python tools/slice_walker_sheets.py --frame-size 96
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "sprites_out", "characters", "walkers")
DEFAULT_DST = os.path.join(ROOT, "assets", "characters", "walkers")

GRID_COLS = 3
GRID_ROWS = 4
WHITE_THRESHOLD = 235
DEFAULT_FRAME_SIZE = 96
# Taille attendue des feuilles ComfyUI (LoRA Walking_Sprite) — normalise avant découpe.
SHEET_WIDTH = 832
SHEET_HEIGHT = 1216
# Marge intérieure par case pour éviter les bords voisins (résidus de sprite).
CELL_INSET_RATIO = 0.08

# Fond de génération → détourage (chroma key depuis les bords).
# green : vert menthe SD (~#BDE5CB) — meilleur que blanc pour personnages clairs.
BACKGROUND_PRESETS = {
    "white": {"prompt": "white background", "key": None, "threshold": WHITE_THRESHOLD, "tolerance": 0},
    "green": {"prompt": "solid mint green background", "key": (189, 229, 203), "tolerance": 48, "threshold": 0},
    "magenta": {"prompt": "solid magenta background", "key": (255, 0, 255), "tolerance": 90, "threshold": 0},
}
CURRENT_BACKGROUND = "white"


def _color_dist(r, g, b, key):
    return ((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) ** 0.5


def is_chroma_background_pixel(r, g, b, a, key, tolerance):
    """
    True seulement pour les pixels qui sont clairement le fond chroma (ex. vert menthe).
    Ne retire jamais le blanc / gris clair du personnage.
    """
    if a < 8:
        return False

    # Blanc, cheveux clairs, highlights — toujours garder
    if r >= 215 and g >= 215 and b >= 215:
        return False

    kr, kg, kb = key

    # Vert menthe : le canal vert doit dominer (signature du fond)
    if kg >= kr and kg >= kb:
        if g < r + 10 or g < b + 8:
            return False
    # Magenta : rouge et bleu dominants, peu de vert
    elif kr >= kg and kb >= kg:
        if r < g + 15 and b < g + 15:
            return False
        if _color_dist(r, g, b, key) > tolerance:
            return False
        return True
    else:
        return False

    return _color_dist(r, g, b, key) <= tolerance


def chroma_alpha_factor(r, g, b, key, tolerance, soft_range):
    """Comme pour le blanc (voir strip_edge_white) : un dégradé plutôt qu'un
    seuil tout-ou-rien. Renvoie 0 (fond pur) à 1 (perso, alpha inchangé)."""
    d = _color_dist(r, g, b, key)
    if d >= tolerance + soft_range:
        return 1.0
    if d <= tolerance:
        return 0.0
    return (d - tolerance) / soft_range


def strip_chroma_edge(im, key, tolerance, soft_range=70, max_depth=12):
    """Retire le fond chroma connecté aux bords de l'image, avec un alpha dégradé
    près de la limite. Comme strip_edge_white : zone "certaine" (nettement fond
    chroma) traversée sans limite de profondeur, zone "ambigüe" (proche
    chromatiquement mais pas franchement) limitée à `max_depth` pixels depuis le
    dernier pixel de fond certain -- empêche de tunneller dans le personnage."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited = set()
    stack = []

    def classify(x, y):
        r, g, b, a = px[x, y]
        if a < 8 or (r >= 215 and g >= 215 and b >= 215):
            return None
        if is_chroma_background_pixel(r, g, b, a, key, tolerance):
            return "core"
        if is_chroma_background_pixel(r, g, b, a, key, tolerance + soft_range):
            return "soft"
        return None

    for x in range(w):
        if classify(x, 0):
            stack.append((x, 0, 0))
        if classify(x, h - 1):
            stack.append((x, h - 1, 0))
    for y in range(h):
        if classify(0, y):
            stack.append((0, y, 0))
        if classify(w - 1, y):
            stack.append((w - 1, y, 0))

    while stack:
        x, y, depth = stack.pop()
        if (x, y) in visited:
            continue
        kind = classify(x, y)
        if kind is None or (kind == "soft" and depth > max_depth):
            continue
        visited.add((x, y))
        r, g, b, a = px[x, y]
        factor = chroma_alpha_factor(r, g, b, key, tolerance, soft_range)
        px[x, y] = (r, g, b, int(a * factor))
        next_depth = 0 if kind == "core" else depth + 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                stack.append((nx, ny, next_depth))

    return im


def strip_background(im, mode=None):
    mode = mode or CURRENT_BACKGROUND
    preset = BACKGROUND_PRESETS.get(mode, BACKGROUND_PRESETS["white"])
    if preset["key"] is None:
        return strip_edge_white(im, preset["threshold"])
    return strip_chroma_edge(im, preset["key"], preset["tolerance"])


def strip_white_background(im, threshold=WHITE_THRESHOLD):
    """Alias — utilise le preset de fond courant."""
    return strip_background(im)


def strip_edge_white(im, threshold=WHITE_THRESHOLD, soft_range=200, max_depth=12):
    """Retire le blanc connecté aux bords — préserve le blanc du personnage
    (casque, tunique). Alpha dégradé près de la limite (pas tout-ou-rien) pour
    éviter un halo de pixels "presque blancs" restés pleinement opaques.

    Deux zones : "certain" (très blanc, >= threshold) traversée sans limite de
    profondeur -- le fond peut être aussi grand qu'il veut. "ambigüe" (dans la
    plage soft_range, ni clairement fond ni clairement perso) traversée sur
    `max_depth` pixels MAX depuis le dernier pixel de fond certain -- ça empêche
    de tunneller à travers une zone claire mais légitime du personnage (cheveux
    blonds, tunique blanche...), peu importe sa teinte, simplement parce qu'elle
    est trop loin du vrai contour pour être de l'anti-aliasing.
    (Vérifié : sans cette distinction, limiter juste la profondeur totale depuis
    le bord de l'image ne marchait pas non plus -- le fond pur autour du
    personnage est lui-même souvent large de plusieurs dizaines de pixels.)
    """
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    visited = set()
    stack = []

    def whiteness(r, g, b):
        return min(r, g, b)

    def classify(x, y):
        r, g, b, a = px[x, y]
        if a < 8:
            return None
        wv = whiteness(r, g, b)
        if wv >= threshold:
            return "core"
        if wv >= threshold - soft_range:
            return "soft"
        return None

    for x in range(w):
        if classify(x, 0):
            stack.append((x, 0, 0))
        if classify(x, h - 1):
            stack.append((x, h - 1, 0))
    for y in range(h):
        if classify(0, y):
            stack.append((0, y, 0))
        if classify(w - 1, y):
            stack.append((w - 1, y, 0))

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
        if wv >= threshold:
            new_alpha = 0
        else:
            ratio = max(0, min(1, (wv - (threshold - soft_range)) / soft_range))
            new_alpha = int(a * (1 - ratio))
        px[x, y] = (r, g, b, new_alpha)
        next_depth = 0 if kind == "core" else depth + 1
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in visited:
                stack.append((nx, ny, next_depth))

    return im


def alpha_bbox(im, threshold=WHITE_THRESHOLD):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    minx, miny, maxx, maxy = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            found = True
            minx = min(minx, x)
            miny = min(miny, y)
            maxx = max(maxx, x)
            maxy = max(maxy, y)
    if not found:
        return (0, 0, w, h)
    return (minx, miny, maxx + 1, maxy + 1)


def strip_gray_noise(im, max_spread=18, min_avg=175, foot_ratio=0.72):
    """Retire les taches grises autour des pieds (artefacts ComfyUI)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    foot_y = int(h * foot_ratio)
    for y in range(foot_y, h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            spread = max(r, g, b) - min(r, g, b)
            if spread <= max_spread and (r + g + b) / 3 >= min_avg:
                px[x, y] = (0, 0, 0, 0)
    return im


def fix_alpha_fringe(img, filter_size=3, solid_alpha=250, iterations=4):
    """
    Décontamination alpha : conserve l'alpha d'origine, remplace le RGB des
    pixels pas pleinement opaques par une couleur extrapolée depuis les pixels
    opaques voisins, pondérée par l'alpha réel de chaque pixel (pas un seuil
    binaire ni un MaxFilter par canal -- celui-ci pouvait inventer une teinte
    qui n'existe ni dans le personnage ni dans le fond, ce qui laissait passer
    un halo clair/bleuté malgré l'appel à cette fonction). Les pixels déjà
    pleinement opaques (alpha >= solid_alpha) ne sont jamais modifiés.
    """
    img = img.convert("RGBA")
    arr = np.array(img, dtype=np.float64)
    rgb = arr[..., :3]
    alpha = arr[..., 3]

    # Pondération par l'alpha réel (pas binaire) : un pixel à alpha=128 ne compte
    # que pour moitié dans la propagation -- aucune contamination possible par une
    # couleur cachée derrière un pixel peu ou pas opaque.
    weight = alpha / 255.0
    weighted_rgb = rgb * weight[..., None]
    solid_mask = alpha >= solid_alpha

    blur_radius = max(1, filter_size // 2)
    for _ in range(iterations):
        w_img = Image.fromarray(weighted_rgb.astype(np.uint8), "RGB")
        w_img = w_img.filter(ImageFilter.BoxBlur(blur_radius))
        weighted_rgb = np.array(w_img, dtype=np.float64)

        wt_img = Image.fromarray((weight * 255).astype(np.uint8), "L")
        wt_img = wt_img.filter(ImageFilter.BoxBlur(blur_radius))
        weight = np.array(wt_img, dtype=np.float64) / 255.0

        # Les pixels déjà bien opaques restent strictement inchangés à chaque
        # itération -- on étend la couleur SEULEMENT vers les pixels transparents
        # ou semi-transparents, jamais vers l'intérieur du personnage.
        weighted_rgb[solid_mask] = rgb[solid_mask]
        weight[solid_mask] = 1.0

    safe_weight = np.where(weight < 1e-3, 1, weight)
    extended_rgb = np.clip(weighted_rgb / safe_weight[..., None], 0, 255)

    result = np.dstack([extended_rgb, alpha]).astype(np.uint8)
    return Image.fromarray(result, "RGBA")


def _is_foreground(r, g, b, a, threshold=WHITE_THRESHOLD):
    # Après strip_edge_white, tout pixel opaque restant appartient au personnage.
    return a >= 16


def _component_from_seed(px, w, h, seed, threshold=WHITE_THRESHOLD):
    visited = set()
    stack = [seed]
    visited.add(seed)
    coords = []
    minx = maxx = seed[0]
    miny = maxy = seed[1]

    while stack:
        cx, cy = stack.pop()
        coords.append((cx, cy))
        minx = min(minx, cx)
        maxx = max(maxx, cx)
        miny = min(miny, cy)
        maxy = max(maxy, cy)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = cx + dx, cy + dy
                if nx < 0 or ny < 0 or nx >= w or ny >= h:
                    continue
                if (nx, ny) in visited:
                    continue
                nr, ng, nb, na = px[nx, ny]
                if not _is_foreground(nr, ng, nb, na, threshold):
                    continue
                visited.add((nx, ny))
                stack.append((nx, ny))

    return coords, (minx, miny, maxx + 1, maxy + 1)


def _nearest_foreground_seed(px, w, h, threshold=WHITE_THRESHOLD):
    cx, cy = w // 2, h // 2
    if _is_foreground(*px[cx, cy], threshold):
        return (cx, cy)

    best = None
    for y in range(h):
        for x in range(w):
            if not _is_foreground(*px[x, y], threshold):
                continue
            d = (x - cx) ** 2 + (y - cy) ** 2
            if best is None or d < best[0]:
                best = (d, x, y)
    return (best[1], best[2]) if best else None


def isolate_largest_sprite(cell, threshold=WHITE_THRESHOLD):
    """Garde le blob centré (personnage) — ignore les bavures des cases voisines."""
    cell = strip_background(cell.convert("RGBA"))
    cell = fix_alpha_fringe(cell)
    w, h = cell.size
    px = cell.load()
    seed = _nearest_foreground_seed(px, w, h, threshold)
    if seed is None:
        return cell

    coords, bbox = _component_from_seed(px, w, h, seed, threshold)
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for cx, cy in coords:
        opx[cx, cy] = px[cx, cy]
    return out.crop(bbox)


def remove_stray_pixels(im, min_neighbors=4, passes=2):
    """Retire les pixels isolés / traits horizontaux (bavures ComfyUI)."""
    im = im.convert("RGBA")
    for _ in range(passes):
        px = im.load()
        w, h = im.size
        to_clear = []
        for y in range(h):
            for x in range(w):
                if px[x, y][3] < 16:
                    continue
                neighbors = 0
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] >= 16:
                            neighbors += 1
                if neighbors < min_neighbors:
                    to_clear.append((x, y))
        for x, y in to_clear:
            px[x, y] = (0, 0, 0, 0)
    return im


def finish_sprite_frame(im):
    """Post-traitement : bavures isolées puis décontamination alpha (sans érosion)."""
    im = remove_stray_pixels(im, min_neighbors=4, passes=1)
    im = fix_alpha_fringe(im)
    im = fix_alpha_fringe(im, filter_size=5)
    return im


def clean_sprite_edges(im):
    return finish_sprite_frame(im)


def fit_frame(cell, frame_size, feet_pad=0.06):
    """Centre horizontalement, ancres les pieds vers le bas de la case."""
    cell = remove_stray_pixels(isolate_largest_sprite(cell), min_neighbors=4, passes=1)
    x0, y0, x1, y1 = alpha_bbox(cell)
    crop = cell.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    if cw < 1 or ch < 1:
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))

    inner = int(frame_size * (1 - feet_pad * 2))
    scale = min(inner / cw, inner / ch)
    nw = max(1, int(cw * scale))
    nh = max(1, int(ch * scale))
    # BOX préserve mieux les bords alpha que NEAREST lors du scale down.
    resample = Image.Resampling.BOX if scale < 1 else Image.Resampling.LANCZOS
    resized = crop.resize((nw, nh), resample)

    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    ox = (frame_size - nw) // 2
    oy = frame_size - nh - int(frame_size * feet_pad * 0.5)
    out.paste(resized, (ox, oy), resized)
    return finish_sprite_frame(out)


def slice_sheet(path, frame_size=DEFAULT_FRAME_SIZE, cell_inset=CELL_INSET_RATIO):
    im = Image.open(path).convert("RGBA")
    if im.size != (SHEET_WIDTH, SHEET_HEIGHT):
        im = im.resize((SHEET_WIDTH, SHEET_HEIGHT), Image.LANCZOS)

    w, h = im.size
    cw, ch = w // GRID_COLS, h // GRID_ROWS
    mx = max(1, int(cw * cell_inset))
    my = max(1, int(ch * cell_inset))
    out = Image.new("RGBA", (frame_size * GRID_COLS, frame_size * GRID_ROWS), (0, 0, 0, 0))

    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            x0 = col * cw + mx
            y0 = row * ch + my
            x1 = (col + 1) * cw - mx
            y1 = (row + 1) * ch - my
            cell = im.crop((x0, y0, x1, y1))
            frame = fit_frame(cell, frame_size)
            out.paste(frame, (col * frame_size, row * frame_size))

    return out


def main():
    global CURRENT_BACKGROUND
    parser = argparse.ArgumentParser(description="Découpe feuilles walker 3×4 pour le jeu.")
    parser.add_argument("--from", dest="src_dir", default=DEFAULT_SRC, help="Dossier source PNG bruts")
    parser.add_argument("--to", dest="dst_dir", default=DEFAULT_DST, help="Dossier assets walkers")
    parser.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE, help="Taille d'une frame (px)")
    parser.add_argument("--cell-inset", type=float, default=CELL_INSET_RATIO,
                        help="Marge intérieure par case (0–0.15) pour couper les bavures voisines")
    parser.add_argument(
        "--background", choices=list(BACKGROUND_PRESETS.keys()), default="white",
        help="Couleur de fond ComfyUI : white (défaut), green (vert menthe), magenta",
    )
    parser.add_argument("--only", metavar="FICHIER", help="Ne traiter qu'un PNG (ex: water.png)")
    args = parser.parse_args()

    CURRENT_BACKGROUND = args.background
    preset = BACKGROUND_PRESETS[CURRENT_BACKGROUND]

    src_dir = os.path.abspath(args.src_dir)
    dst_dir = os.path.abspath(args.dst_dir)
    if not os.path.isdir(src_dir):
        raise SystemExit(f"Dossier source introuvable : {src_dir}")

    os.makedirs(dst_dir, exist_ok=True)
    files = sorted(f for f in os.listdir(src_dir) if f.lower().endswith(".png"))
    if args.only:
        only = args.only if args.only.endswith(".png") else f"{args.only}.png"
        if only not in files:
            raise SystemExit(f"Fichier introuvable dans {src_dir} : {only}")
        files = [only]

    print(f"Découpe {len(files)} feuille(s) -> {dst_dir} (frame {args.frame_size}px, "
          f"grille {GRID_COLS}×{GRID_ROWS}, fond={CURRENT_BACKGROUND})\n")
    for name in files:
        src = os.path.join(src_dir, name)
        dst = os.path.join(dst_dir, name)
        atlas = slice_sheet(src, args.frame_size, args.cell_inset)
        atlas.save(dst)
        print(f"  OK  {name}  ({atlas.size[0]}×{atlas.size[1]})")

    print("\nTerminé. Recharge le jeu (Ctrl+F5).")
    print("Alignez CHARACTER_FRAME_SIZE dans js/config.js sur --frame-size si vous changez la taille.")
    print("\nAutres catégories :")
    print("  python tools/slice_walker_sheets.py --from sprites_out/characters/monsters --to assets/characters/monsters --background green")
    print("  python tools/slice_walker_sheets.py --from sprites_out/characters/heroes --to assets/characters/heroes --background green")


if __name__ == "__main__":
    main()
