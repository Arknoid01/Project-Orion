#!/usr/bin/env python3
"""Liste les textures référencées vs présentes dans assets/."""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = open(os.path.join(ROOT, "js", "config.js"), encoding="utf-8").read()
sprites = set(re.findall(r"sprite:'(assets/[^'?]+)", cfg))
sprites.add("assets/world/worldMap.png")

existing = set()
for dirpath, _, files in os.walk(os.path.join(ROOT, "assets")):
    for f in files:
        if f.endswith(".png"):
            rel = os.path.relpath(os.path.join(dirpath, f), ROOT).replace("\\", "/")
            existing.add(rel)

# Also parse ASSETS from comfy script
comfy = open(os.path.join(ROOT, "comfy_batch_generate.py"), encoding="utf-8").read()
in_assets = set(re.findall(r'"output":\s*"([^"]+\.png)"', comfy))

wanted_dedicated = [
    "assets/buildings/carrotFarm.png",
    "assets/buildings/huntingPavilion.png",
    "assets/houses/domaine.png",
]

print("=== Dans config, fichier absent ===")
for s in sorted(sprites):
    if s not in existing:
        print(" ", s)

print("\n=== Textures dédiées souhaitées (réutilisation actuelle) ===")
for s in wanted_dedicated:
    in_comfy = os.path.basename(s) in in_assets
    print(f"  {s}: file={'OK' if s in existing else 'MISSING'}, comfy={'OK' if in_comfy else 'NOT IN SCRIPT'}")

print("\n=== Bâtiments en jeu sans entrée comfy_batch_generate ===")
game_buildings = sorted(
    os.path.basename(p)
    for p in existing
    if p.startswith("assets/buildings/") and p.endswith(".png")
)
for b in game_buildings:
    if b not in in_assets:
        print(" ", b)

print("\n=== Entrées comfy sans fichier assets ===")
for out in sorted(in_assets):
    cat = "houses" if out in ("hut.png", "house.png", "decent.png", "villa.png", "residence.png", "palais.png", "domaine.png") else "buildings"
    if cat == "tiles":
        path = f"assets/tiles/{out}"
    elif cat == "houses":
        path = f"assets/houses/{out}"
    else:
        path = f"assets/buildings/{out}"
    if not os.path.isfile(os.path.join(ROOT, path.replace("/", os.sep))):
        if out.endswith(".png") and cat != "tiles":
            # tiles may be elsewhere
            if not any(out in p for p in existing):
                print(" ", out, "->", path)
