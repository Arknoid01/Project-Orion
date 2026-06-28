"""
Compose des personnages LPC (Universal LPC Spritesheet) et les convertit en atlas
jeu Olympos : 3 frames × 4 directions @ 96 px (288×384).

Dépendances : pip install pillow numpy
Dépôt LPC : définir LPC_REPO ou laisser le chemin par défaut (Downloads/Nouveau dossier).
"""
from __future__ import annotations

import json
import os
import sys
from typing import Any

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_LPC_REPO = os.path.join(
    os.path.expanduser("~"),
    "Downloads",
    "Nouveau dossier",
    "lpc_repo",
)

LPC_FRAME = 64
LPC_COLS = 9
LPC_ROWS = 4
GAME_FRAME = 96
GAME_COLS = 3
GAME_ROWS = 4
# Frames de la cycle de marche LPC (9 frames) → 3 frames jeu (contact, passage, contact).
PICK_FRAMES = (1, 4, 7)


def get_repo() -> str:
    repo = os.environ.get("LPC_REPO", DEFAULT_LPC_REPO)
    if not os.path.isdir(repo):
        fallback = os.path.join(ROOT, "lpc_repo")
        if os.path.isdir(fallback):
            return fallback
        raise FileNotFoundError(
            f"Dépôt LPC introuvable : {repo}\n"
            "Place lpc_repo dans Downloads/Nouveau dossier ou définis LPC_REPO."
        )
    return repo


def load_json(repo: str, rel_path: str) -> dict:
    path = os.path.join(repo, rel_path.replace("/", os.sep))
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def recolor(img: Image.Image, source_hexes: list, target_hexes: list, tolerance: int = 1) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    rgb = arr[..., :3].astype(np.int16)
    out_rgb = rgb.copy()
    for src_hex, tgt_hex in zip(source_hexes, target_hexes):
        src = np.array(hex_to_rgb(src_hex))
        tgt = np.array(hex_to_rgb(tgt_hex))
        match = np.all(np.abs(rgb - src) <= tolerance, axis=-1)
        out_rgb[match] = tgt
    arr[..., :3] = out_rgb.astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def resolve_sprite_path(repo: str, base_path: str, animation: str, variant: str | None) -> str:
    """Résout le chemin PNG selon les conventions LPC (direct, variant/, etc.)."""
    base = os.path.join(repo, "spritesheets", base_path.replace("/", os.sep))
    norm = base_path.replace("\\", "/").rstrip("/")

    if variant:
        direct = os.path.join(base, f"{variant}.png")
        if os.path.isfile(direct):
            return direct

    # Le JSON pointe parfois déjà vers le dossier d'animation (.../walk/).
    if norm.endswith(f"/{animation}"):
        if variant:
            direct = os.path.join(base, f"{variant}.png")
            if os.path.isfile(direct):
                return direct
        if os.path.isdir(base):
            for name in sorted(os.listdir(base)):
                if name.endswith(".png"):
                    return os.path.join(base, name)

    candidates = []
    if variant:
        candidates.append(os.path.join(base, animation, f"{variant}.png"))
    candidates.append(os.path.join(base, f"{animation}.png"))
    candidates.append(os.path.join(base, animation, "walk.png"))
    if variant:
        candidates.append(os.path.join(base, animation, f"{variant}.png"))
    for path in candidates:
        if os.path.isfile(path):
            return path
    anim_dir = os.path.join(base, animation)
    if os.path.isdir(anim_dir):
        names = sorted(f for f in os.listdir(anim_dir) if f.endswith(".png"))
        if variant:
            for name in names:
                if name.replace(".png", "") == variant:
                    return os.path.join(anim_dir, name)
        if names:
            return os.path.join(anim_dir, names[0])
    raise FileNotFoundError(f"Sprite LPC introuvable : {base_path} anim={animation} variant={variant}")


def _resolve_body_path(layer: dict, body_type: str) -> str | None:
    if body_type in layer:
        return layer[body_type]
    for fallback in (body_type, "male", "muscular", "female", "teen", "pregnant"):
        if fallback in layer:
            return layer[fallback]
    return None


def _layer_matches_animation(layer: dict, animation: str) -> bool:
    custom = layer.get("custom_animation")
    if not custom:
        return True
    if custom == animation:
        return True
    if animation == "walk" and custom in ("walk", "walk_128"):
        return True
    return False


def apply_recolor(repo: str, img: Image.Image, definition: dict, recolor_to: str | None) -> Image.Image:
    if not recolor_to or "recolors" not in definition:
        return img
    recolors = definition["recolors"]
    material = recolors.get("material")
    if not material and "color_1" in recolors:
        material = recolors["color_1"].get("material")
    if not material:
        return img
    meta = load_json(repo, f"palette_definitions/{material}/meta_{material}.json")
    scheme = meta.get("default", "ulpc")
    source_name = recolors.get("base", meta.get("base", "light"))
    if isinstance(source_name, str) and "." in source_name:
        source_name = source_name.split(".")[-1]
    palette_path = f"palette_definitions/{material}/{material}_{scheme}.json"
    palette = load_json(repo, palette_path)
    target = recolor_to.split(".")[-1] if isinstance(recolor_to, str) and "." in recolor_to else recolor_to
    if source_name not in palette or target not in palette:
        return img
    return recolor(img, palette[source_name], palette[target])


def load_sheet_layer(
    repo: str,
    definition: dict,
    layer_key: str,
    body_type: str,
    animation: str,
    variant: str | None,
    recolor: str | None,
    head_kind: str | None = None,
) -> tuple[Image.Image, int]:
    layer = definition[layer_key]
    zpos = layer.get("zPos", 0)
    anim = layer.get("custom_animation") or animation
    if anim != animation and animation == "walk" and anim not in ("walk", "walk_128"):
        anim = animation
    base_path = _resolve_body_path(layer, body_type)
    if not base_path:
        raise KeyError(f"Pas de variante {body_type} dans {layer_key}")
    if "${head}" in base_path:
        hk = head_kind or ("female" if body_type == "female" else "male")
        base_path = base_path.replace("${head}", hk)
    path = resolve_sprite_path(repo, base_path, anim, variant)
    img = Image.open(path).convert("RGBA")
    img = apply_recolor(repo, img, definition, recolor)
    return img, zpos


def load_sheet_definition(
    repo: str,
    sheet_rel: str,
    body_type: str,
    animation: str,
    variant: str | None = None,
    recolor: str | None = None,
    head_kind: str | None = None,
) -> list[tuple[Image.Image, int]]:
    definition = load_json(repo, sheet_rel)
    layers = []
    for key in sorted(definition.keys()):
        if not key.startswith("layer_"):
            continue
        layer = definition[key]
        if not _layer_matches_animation(layer, animation):
            continue
        try:
            layers.append(
                load_sheet_layer(
                    repo, definition, key, body_type, animation, variant, recolor, head_kind
                )
            )
        except (FileNotFoundError, KeyError):
            continue
    if not layers and "layer_1" in definition:
        layers.append(
            load_sheet_layer(
                repo, definition, "layer_1", body_type, animation, variant, recolor, head_kind
            )
        )
    return layers


def compose_character(
    layers: list[dict[str, Any]],
    body_type: str = "male",
    animation: str = "walk",
    repo: str | None = None,
) -> Image.Image:
    """layers: [{sheet, variant?, recolor?, head_kind?}, ...]"""
    repo = repo or get_repo()
    loaded: list[tuple[Image.Image, int]] = []
    for spec in layers:
        sheet = spec["sheet"]
        variant = spec.get("variant")
        recolor = spec.get("recolor")
        head_kind = spec.get("head_kind")
        loaded.extend(
            load_sheet_definition(
                repo, sheet, body_type, animation, variant, recolor, head_kind
            )
        )
    if not loaded:
        raise ValueError("Aucun calque composé")
    loaded.sort(key=lambda pair: pair[1])
    canvas = Image.new("RGBA", loaded[0][0].size, (0, 0, 0, 0))
    cw, ch = canvas.size
    for img, _z in loaded:
        if img.size != (cw, ch):
            img = img.resize((cw, ch), Image.LANCZOS)
        canvas = Image.alpha_composite(canvas, img)
    return canvas


def _alpha_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    bbox = im.split()[3].getbbox()
    return bbox or (0, 0, im.width, im.height)


def _fit_frame(cell: Image.Image, frame_size: int) -> Image.Image:
    """Centre le sprite et ancre les pieds en bas de la case."""
    x0, y0, x1, y1 = _alpha_bbox(cell)
    crop = cell.crop((x0, y0, x1, y1))
    cw, ch = crop.size
    if cw < 1 or ch < 1:
        return Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    scale = min(frame_size / cw, frame_size / ch) * 0.92
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    ox = (frame_size - nw) // 2
    oy = frame_size - nh - max(2, int(frame_size * 0.04))
    out.paste(crop, (ox, oy), crop)
    return out


def lpc_walk_to_game_atlas(sheet: Image.Image, pick_frames: tuple[int, ...] = PICK_FRAMES) -> Image.Image:
    """576×256 LPC walk → 288×384 atlas Olympos."""
    if sheet.size != (LPC_COLS * LPC_FRAME, LPC_ROWS * LPC_FRAME):
        sheet = sheet.resize((LPC_COLS * LPC_FRAME, LPC_ROWS * LPC_FRAME), Image.LANCZOS)
    out = Image.new("RGBA", (GAME_COLS * GAME_FRAME, GAME_ROWS * GAME_FRAME), (0, 0, 0, 0))
    for row in range(GAME_ROWS):
        for dst_col, src_col in enumerate(pick_frames):
            box = (src_col * LPC_FRAME, row * LPC_FRAME, (src_col + 1) * LPC_FRAME, (row + 1) * LPC_FRAME)
            frame = _fit_frame(sheet.crop(box), GAME_FRAME)
            out.paste(frame, (dst_col * GAME_FRAME, row * GAME_FRAME), frame)
    return out


def generate_character_atlas(recipe: dict, repo: str | None = None) -> Image.Image:
    repo = repo or get_repo()
    body_type = recipe.get("body_type", "male")
    sheet = compose_character(recipe["layers"], body_type=body_type, animation="walk", repo=repo)
    return lpc_walk_to_game_atlas(sheet)


def list_available(category_glob: str, repo: str | None = None) -> None:
    import glob

    repo = repo or get_repo()
    paths = glob.glob(os.path.join(repo, "sheet_definitions", category_glob), recursive=True)
    for path in sorted(paths):
        rel = os.path.relpath(path, repo).replace("\\", "/")
        if "meta_" in rel:
            continue
        name = load_json(repo, rel).get("name", "?")
        print(f"  {name:30s} -> {rel}")


if __name__ == "__main__":
    test = {
        "body_type": "male",
        "layers": [
            {"sheet": "sheet_definitions/body/body.json", "recolor": "light"},
            {"sheet": "sheet_definitions/feet/feet_sandals.json", "variant": "brown"},
            {"sheet": "sheet_definitions/legs/pants/legs_pants.json", "variant": "white"},
            {"sheet": "sheet_definitions/torso/shirts/longsleeve/torso_clothes_longsleeve.json", "variant": "blue"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "dark brown"},
        ],
    }
    out = generate_character_atlas(test)
    dest = os.path.join(ROOT, "sprites_out", "lpc_test.png")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    out.save(dest)
    print(f"Test OK -> {dest} ({out.size[0]}x{out.size[1]})")
