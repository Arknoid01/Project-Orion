#!/usr/bin/env python3
"""Recadre et nettoie les PNG rendus par Blender → assets/generated_nature/."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "assets" / "generated_nature" / "raw"
OUT = ROOT / "assets" / "generated_nature"
MANIFEST = ROOT / "tools" / "nature_blend_manifest.json"

sys.path.insert(0, str(ROOT / "tools"))
from clean_tree_sprites import clean_tree_sprite  # noqa: E402

TREE_W = 128
BUSH_W = 96

# Fallback noms procéduraux
PROCEDURAL_TREES = ["tree_olive", "tree_cypress", "tree_pine", "tree_umbrella", "tree_fig"]
PROCEDURAL_BUSHES = ["bush_round", "bush_flower", "bush_hedge"]


def _resize_to_width(im: Image.Image, target_w: int) -> Image.Image:
    w, h = im.size
    if w <= 0:
        return im
    scale = target_w / w
    nh = max(1, int(round(h * scale)))
    return im.resize((target_w, nh), Image.LANCZOS)


def _trim_alpha_bbox(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def process_blend_sprite(im: Image.Image) -> Image.Image:
    """Fond noir Blender -> transparent, sans purge agressive."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8 or max(r, g, b) < 28:
                px[x, y] = (0, 0, 0, 0)
    return _trim_alpha_bbox(im)


def process_one(src: Path, dst: Path, target_w: int, *, from_blend: bool = False):
    if not src.exists():
        return False
    im = Image.open(src)
    if from_blend:
        im = process_blend_sprite(im)
    else:
        im = clean_tree_sprite(im, white_threshold=248, black_threshold=18, soft_range=60)
    im = _resize_to_width(im, target_w)
    OUT.mkdir(parents=True, exist_ok=True)
    im.save(dst, optimize=True)
    print(f"  {src.name} -> {dst.name} ({im.size[0]}x{im.size[1]})")
    return True


def _manifest_outputs():
    """Liste (nom_sans_ext, largeur, from_blend) depuis le manifeste."""
    if not MANIFEST.is_file():
        return []
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    out = []
    for asset in data.get("assets", []):
        kind = asset.get("kind", "tree")
        width = TREE_W if kind == "tree" else BUSH_W
        variants = asset.get("variants")
        if variants:
            for var in variants:
                name = var.get("output", "")
                if name.endswith(".png"):
                    name = name[:-4]
                if name:
                    out.append((name, width, True))
        else:
            name = asset.get("output", "")
            if name.endswith(".png"):
                name = name[:-4]
            if name:
                out.append((name, width, True))
    return out


def _entries_from_manifest():
    return _manifest_outputs()


def _entries_from_raw():
    if not RAW.is_dir():
        return []
    out = []
    for p in sorted(RAW.glob("*.png")):
        name = p.stem
        kind = "bush" if name.startswith("bush_") else "tree"
        out.append((name, TREE_W if kind == "tree" else BUSH_W, False))
    return out


def tint_tree_sprite(im: Image.Image, trunk_rgb, leaf_rgb, trunk_bottom_frac: float = 0.30):
    """Teinte tronc (bas) + feuillage (haut) sur un rendu monochrome Blender."""
    if not trunk_rgb:
        trunk_rgb = (0.45, 0.30, 0.16)
    if not leaf_rgb:
        leaf_rgb = (0.32, 0.55, 0.28)
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    y_trunk = int(h * (1 - trunk_bottom_frac))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 8 or max(r, g, b) < 20:
                px[x, y] = (0, 0, 0, 0)
                continue
            lum = min(1.0, max(r, g, b) / 255.0 * 1.08)
            base = trunk_rgb if y >= y_trunk else leaf_rgb
            px[x, y] = (
                min(255, int(base[0] * 255 * lum)),
                min(255, int(base[1] * 255 * lum)),
                min(255, int(base[2] * 255 * lum)),
                a,
            )
    return im


def _process_manifest_variants() -> int:
    if not MANIFEST.is_file():
        return 0
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    ok = 0
    OUT.mkdir(parents=True, exist_ok=True)
    for asset in data.get("assets", []):
        variants = asset.get("variants")
        if not variants:
            continue
        base_name = asset.get("base_output") or variants[0].get("output") or "_tree_base.png"
        if base_name.endswith(".png"):
            base_name = base_name[:-4]
        base_src = RAW / f"{base_name}.png"
        if not base_src.exists():
            # repli : premier variant déjà rendu
            fb = variants[0].get("output", "").replace(".png", "")
            base_src = RAW / f"{fb}.png"
        if not base_src.exists():
            print(f"  SKIP variantes — base introuvable ({base_name})")
            continue
        base_im = process_blend_sprite(Image.open(base_src))
        width = TREE_W if asset.get("kind", "tree") == "tree" else BUSH_W
        for var in variants:
            out_name = var.get("output", "")
            if out_name.endswith(".png"):
                out_name = out_name[:-4]
            if not out_name:
                continue
            tinted = tint_tree_sprite(
                base_im.copy(),
                var.get("trunk"),
                var.get("leaf"),
                trunk_bottom_frac=var.get("trunk_frac", 0.30),
            )
            tinted = _resize_to_width(tinted, width)
            tinted.save(OUT / f"{out_name}.png", optimize=True)
            print(f"  {base_src.name} -> {out_name}.png ({tinted.size[0]}x{tinted.size[1]}) [teinte]")
            ok += 1
    return ok


def main():
    ok = _process_manifest_variants()
    if ok:
        print(f"Post-traitement OK ({ok} sprites teintes)")
        return

    entries = _entries_from_manifest()
    if not entries:
        entries = [(n, TREE_W, False) for n in PROCEDURAL_TREES] + [(n, BUSH_W, False) for n in PROCEDURAL_BUSHES]

    for name, width, from_blend in entries:
        if process_one(RAW / f"{name}.png", OUT / f"{name}.png", width, from_blend=from_blend):
            ok += 1

    if ok == 0:
        print("Aucun fichier traite. Lance : python tools/run_blender_nature.py --blends")
        sys.exit(1)
    print(f"Post-traitement OK ({ok} sprites)")


if __name__ == "__main__":
    main()
