import os
import re

os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from comfy_batch_generate import ASSETS, TILE_MODE, OUTPUT_DIR

def list_dir(sub):
    p = os.path.join(OUTPUT_DIR, sub)
    return set(os.listdir(p)) if os.path.isdir(p) else set()

have_b, have_h, have_t = list_dir("buildings"), list_dir("houses"), list_dir("tiles")
missing = []
ok = []
for e in ASSETS:
    cat, out = e["category"], e["output"]
    if cat == "tiles" and TILE_MODE == "PROCEDURAL":
        continue
    pool = have_b if cat == "buildings" else have_h if cat == "houses" else have_t
    path = f"{cat}/{out}"
    (ok if out in pool else missing).append(path)

assets_b = set(os.listdir("assets/buildings")) if os.path.isdir("assets/buildings") else set()
assets_h = set(os.listdir("assets/houses")) if os.path.isdir("assets/houses") else set()
assets_t = set(os.listdir("assets/tiles")) if os.path.isdir("assets/tiles") else set()

not_deployed = []
for e in ASSETS:
    if e["category"] == "tiles":
        continue
    pool = assets_b if e["category"] == "buildings" else assets_h
    if e["output"] not in pool:
        not_deployed.append(f"assets/{e['category']}/{e['output']}")

cfg = open("js/config.js", encoding="utf-8").read()
config_missing = [s for s in re.findall(r"sprite:'(assets/[^']+)'", cfg) if not os.path.isfile(s)]

print("=== sprites_out (batch ComfyUI) ===")
print(f"  buildings: {len(have_b)} | houses: {len(have_h)} | tiles: {len(have_t)}")
print(f"  IA: {len(ok)}/{len(ok)+len(missing)} OK")
if missing:
    print("  MANQUANTS:")
    for m in missing:
        print(f"    - {m}")
else:
    print("  Complet.")

print("\n=== assets/ (jeu) ===")
print(f"  buildings: {len(assets_b)} | houses: {len(assets_h)} | tiles: {len(assets_t)}")
if not_deployed:
    print("  Pas deployes depuis sprites_out:")
    for m in not_deployed:
        print(f"    - {m}")
else:
    print("  Tous les batiments/maisons deployes.")

if config_missing:
    print("\n=== config.js sans fichier ===")
    for s in config_missing:
        print(f"    - {s}")
