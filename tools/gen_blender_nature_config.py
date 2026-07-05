#!/usr/bin/env python3
"""Écrit js/generatedNatureSprites.js pour brancher les sprites Blender dans le jeu."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "generated_nature"
JS_OUT = ROOT / "js" / "generatedNatureSprites.js"
MANIFEST = ROOT / "tools" / "nature_blend_manifest.json"
CACHE = "v=4"

PROCEDURAL_TREES = ["tree_olive", "tree_cypress", "tree_pine", "tree_umbrella", "tree_fig"]
PROCEDURAL_BUSHES = ["bush_round", "bush_flower", "bush_hedge"]


def _manifest_sprite_lists():
    if not MANIFEST.is_file():
        return [], []
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    trees, bushes = [], []
    for asset in data.get("assets", []):
        kind = asset.get("kind", "tree")
        bucket = bushes if kind == "bush" else trees
        names = []
        if asset.get("variants"):
            for var in asset["variants"]:
                n = var.get("output", "")
                if n.endswith(".png"):
                    n = n[:-4]
                if n:
                    names.append(n)
        else:
            n = asset.get("output", "")
            if n.endswith(".png"):
                n = n[:-4]
            if n:
                names.append(n)
        for n in names:
            if not (OUT_DIR / f"{n}.png").exists():
                continue
            rel = f"assets/generated_nature/{n}.png?{CACHE}"
            bucket.append(f"  '{rel}',")
    return trees, bushes


def _manifest_entries():
    trees, bushes = _manifest_sprite_lists()
    return trees, bushes


def _procedural_entries():
    trees, bushes = [], []
    for n in PROCEDURAL_TREES:
        if (OUT_DIR / f"{n}.png").exists():
            trees.append(f"  'assets/generated_nature/{n}.png?{CACHE}',")
    for n in PROCEDURAL_BUSHES:
        if (OUT_DIR / f"{n}.png").exists():
            bushes.append(f"  'assets/generated_nature/{n}.png?{CACHE}',")
    return trees, bushes


def main():
    tree_lines, bush_lines = _manifest_entries()
    if not tree_lines and not bush_lines:
        tree_lines, bush_lines = _procedural_entries()

    if not tree_lines:
        print("Aucun sprite dans assets/generated_nature/ — rien a ecrire.")
        return

    js = [
        "// Genere par tools/gen_blender_nature_config.py — ne pas editer a la main.",
        "const GENERATED_NATURE_TREE_SPRITES = [",
        *tree_lines,
        "];",
        "",
        "const GENERATED_NATURE_PROP_SPRITES = [",
        *(bush_lines or ["  // buissons manquants"]),
        "];",
        "",
        "const GENERATED_NATURE_USE = true;",
        "",
    ]
    JS_OUT.write_text("\n".join(js), encoding="utf-8")
    print(f"Ecrit {JS_OUT} ({len(tree_lines)} arbres, {len(bush_lines)} buissons)")


if __name__ == "__main__":
    main()
