"""Ajuste les sprites de batiments/maisons pour qu'ils tiennent dans le losange.

- Sauvegarde les originaux dans assets/_orig (une seule fois) et retravaille
  toujours a partir d'eux : on peut relancer avec un autre SCALE sans degrader.
- Ajoute une marge transparente (reduction a SCALE de la taille actuelle).
- Clippe les coins de la base en losange iso SANS couper le batiment :
  tout ce qui est au-dessus des sommets gauche/droite du losange est conserve,
  seuls les deux coins inferieurs (dallage/cailloux qui depassent) sont coupes.

Reglages : baisse SCALE (0.90 -> 0.85) si ca deborde encore.
"""
import os
import glob
from PIL import Image, ImageDraw

# On dimensionne pour que la BASE se rende a la largeur d'une tuile.
# Le rendu (drawSpriteOnTile) dessine la toile 144 px a DRAW_W px de large.
# Donc une base large de `base_canvas` px se rend a base_canvas * DRAW_W/CANVAS.
# Pour viser BUILDING_SPRITE_W a l'ecran : base_canvas = BUILDING_SPRITE_W * FILL * CANVAS / DRAW_W.
CANVAS = 144          # taille de la toile de sortie (inchangee)
DRAW_W = 64           # doit correspondre au BUILDING_SPRITE_W de config.js / render.js
BUILDING_SPRITE_W = 64
TILE_W = 64           # largeur d'une tuile grille (config.js)
FILL = 1.0            # 1.0 = base = largeur exacte de la tuile ; 1.1 = leger debord
CLIP_BASE = True      # couper les coins de la base en losange
DIRS = ["assets/buildings", "assets/houses"]
ORIG = "assets/_orig"


def content_bbox(img):
    bbox = img.split()[3].getbbox()  # bbox du canal alpha
    return bbox or (0, 0, img.width, img.height)


def clip_base_diamond(content):
    """Met a 0 l'alpha des deux coins inferieurs hors losange iso.
    Le losange a pour largeur la largeur du contenu (rayon vertical = cw/4)."""
    cw, ch = content.size
    half = cw / 4.0                 # demi-diagonale verticale (iso 2:1)
    mid_y = ch - half              # ligne des sommets gauche/droite
    # masque : tout garder au-dessus de mid_y, puis le losange en dessous
    mask = Image.new("L", (cw, ch), 0)
    d = ImageDraw.Draw(mask)
    d.rectangle([0, 0, cw, int(mid_y)], fill=255)          # haut : batiment intact
    d.polygon([(0, mid_y), (cw / 2, mid_y - half),         # losange (haut deja couvert)
               (cw, mid_y), (cw / 2, ch)], fill=255)
    r, g, b, a = content.split()
    from PIL import ImageChops
    a = ImageChops.multiply(a, mask)
    return Image.merge("RGBA", (r, g, b, a))


def process(path, src_path):
    img = Image.open(src_path).convert("RGBA")
    bbox = content_bbox(img)
    baseline = bbox[3]              # bas du contenu d'origine : on le preserve
    content = img.crop(bbox)
    if CLIP_BASE:
        content = clip_base_diamond(content)

    # redimensionne pour que la base se rende a ~TILE_W, en gardant le ratio
    target_w = max(1, int(round(BUILDING_SPRITE_W * FILL * CANVAS / DRAW_W)))
    ratio = target_w / content.width
    target_h = max(1, int(round(content.height * ratio)))
    if target_h > CANVAS:           # borne si tres haut : on cale sur la hauteur
        ratio = CANVAS / content.height
        target_h = CANVAS
        target_w = max(1, int(round(content.width * ratio)))
    content = content.resize((target_w, target_h), Image.LANCZOS)

    # toile transparente. La base reste exactement a sa hauteur d'origine
    # (la reduction se fait vers le haut) -> plus d'effet "enfonce dans le sol".
    out = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ox = (CANVAS - target_w) // 2
    oy = max(0, min(CANVAS - target_h, baseline - target_h))
    out.paste(content, (ox, oy), content)
    out.save(path)
    return f"{os.path.basename(path)}: {target_w}x{target_h} base@{oy + target_h}"


def main():
    os.makedirs(ORIG, exist_ok=True)
    for d in DIRS:
        backup_dir = os.path.join(ORIG, os.path.basename(d))
        os.makedirs(backup_dir, exist_ok=True)
        for path in glob.glob(os.path.join(d, "*.png")):
            name = os.path.basename(path)
            src = os.path.join(backup_dir, name)
            if not os.path.exists(src):           # 1re fois : on archive l'original
                Image.open(path).save(src)
            print(process(path, src))
    print("Termine.")


if __name__ == "__main__":
    main()
