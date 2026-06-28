#!/usr/bin/env python3
"""
Génère tous les sprites personnages Olympos via LPC (Universal LPC Spritesheet).

Usage :
  python tools/generate_lpc_characters.py
  python tools/generate_lpc_characters.py --only walkers water
  LPC_REPO="C:/chemin/lpc_repo" python tools/generate_lpc_characters.py

Sortie : assets/characters/{walkers,gods,monsters,heroes}/*.png (atlas 288×384)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lpc_compositor import generate_character_atlas, get_repo  # noqa: E402

# --- raccourcis calques fréquents ---
B = "sheet_definitions/body/body.json"
SAND = "sheet_definitions/feet/feet_sandals.json"
PANTS = "sheet_definitions/legs/pants/legs_pants.json"
SHIRT = "sheet_definitions/torso/shirts/longsleeve/torso_clothes_longsleeve.json"
ROBE = "sheet_definitions/torso/shirts/torso_clothes_robe.json"
TUNIC = "sheet_definitions/torso/shirts/torso_clothes_tunic.json"
SLEEVELESS = "sheet_definitions/torso/shirts/sleeveless/torso_clothes_sleeveless.json"
LEGION_SKIRT = "sheet_definitions/legs/skirts/legs_skirts_legion.json"
CAPE = "sheet_definitions/torso/cape/cape_solid.json"
BELT_ROBE = "sheet_definitions/torso/waist/belt_robe.json"
CHAIN = "sheet_definitions/torso/torso_chainmail.json"
LEGS_ARM = "sheet_definitions/legs/legs_armour.json"
BOOTS = "sheet_definitions/feet/boots/feet_boots_basic.json"
SHOES = "sheet_definitions/feet/shoes/feet_shoes_basic.json"
SASH = "sheet_definitions/torso/waist/belt_sash.json"
CROWN = "sheet_definitions/headwear/hats/formal/hat_formal_crown.json"
SPEAR = "sheet_definitions/weapons/polearm/weapon_polearm_longspear.json"
TRIDENT = "sheet_definitions/weapons/polearm/weapon_polearm_trident.json"
SWORD = "sheet_definitions/weapons/sword/weapon_sword_longsword.json"
DAGGER = "sheet_definitions/weapons/sword/weapon_sword_dagger.json"
CLUB = "sheet_definitions/weapons/blunt/weapon_blunt_mace.json"
AXE = "sheet_definitions/weapons/blunt/weapon_blunt_waraxe.json"
BOW = "sheet_definitions/weapons/ranged/bow/weapon_ranged_bow_normal.json"
SHIELD = "sheet_definitions/weapons/shields/shield_round.json"
SPARTAN = "sheet_definitions/weapons/shields/shield_spartan.json"
STAFF = "sheet_definitions/weapons/polearm/weapon_polearm_cane.json"
CRYSTAL = "sheet_definitions/weapons/magic/weapon_magic_crystal.json"
GLOWSWORD = "sheet_definitions/weapons/sword/weapon_sword_glowsword.json"
HELM = "sheet_definitions/headwear/helmets/helmets/hat_helmet_sugarloaf_simple.json"
MANTLE = "sheet_definitions/arms/shoulders/shoulders_mantal.json"
FUR_LEGS = "sheet_definitions/legs/pants/legs_fur.json"
WINGS = "sheet_definitions/body/wings/wings_feathered.json"
HEAD_M = "sheet_definitions/head/heads/human/heads_human_male.json"
HEAD_F = "sheet_definitions/head/heads/human/heads_human_female.json"
FACE = "sheet_definitions/head/faces/face_neutral.json"

# Monstres avec tête non-humaine déjà dédiée (pas de visage humain par-dessus).
SKIP_HEAD = {"medusa", "hydra", "minotaur", "cerberus", "hades", "chimera", "dragon", "boar"}
INSERT_HEAD_BEFORE = (
    "hair/", "beards/", "headwear/", "weapon/",
    "heads/beast", "heads/reptile", "heads/undead", "eyes/cyclops",
)


def _skin_tone(recipe: dict) -> str:
    for layer in recipe["layers"]:
        if layer.get("sheet", "").endswith("body/body.json"):
            return layer.get("recolor", "light")
    return "light"


def _insert_head_index(layers: list) -> int:
    for i, layer in enumerate(layers):
        sheet = layer.get("sheet", "")
        if any(k in sheet for k in INSERT_HEAD_BEFORE):
            return i
    return len(layers)


def inject_heads(recipe: dict) -> dict:
    """Ajoute tête + expression faciale aux humains (corps seul = visage vide)."""
    rid = recipe["id"]
    if rid in SKIP_HEAD:
        return recipe
    layers = list(recipe["layers"])
    bt = recipe.get("body_type", "male")
    skin = _skin_tone(recipe)
    hk = "female" if bt == "female" else "male"

    if rid == "zeus":
        for i, layer in enumerate(layers):
            if "heads_human_male_elderly" in layer.get("sheet", ""):
                layers.insert(i + 1, {"sheet": FACE, "head_kind": "elderly", "recolor": skin})
                recipe["layers"] = layers
                return recipe
        return recipe

    if any("heads_" in layer.get("sheet", "") for layer in layers):
        return recipe

    head = HEAD_F if bt == "female" else HEAD_M
    extras = [
        {"sheet": head, "recolor": skin},
        {"sheet": FACE, "head_kind": hk, "recolor": skin},
    ]
    idx = _insert_head_index(layers)
    recipe["layers"] = layers[:idx] + extras + layers[idx:]
    return recipe

# Recettes : rendu le plus proche possible avec les assets LPC disponibles.
RECIPES = [
    # ========== WALKERS (6) ==========
    {
        "id": "water", "category": "walkers", "output": "water.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "white"},
            {"sheet": TUNIC, "variant": "sky"},
            {"sheet": BELT_ROBE, "variant": "white"},
            {"sheet": "sheet_definitions/hair/long/hair_long.json", "recolor": "light_brown"},
        ],
    },
    {
        "id": "market", "category": "walkers", "output": "market.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "tan"},
            {"sheet": SLEEVELESS, "variant": "tan"},
            {"sheet": SASH, "variant": "brown"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "chestnut"},
        ],
    },
    {
        "id": "religion", "category": "walkers", "output": "religion.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "white"},
            {"sheet": SLEEVELESS, "variant": "white"},
            {"sheet": SASH, "variant": "yellow"},
            {"sheet": "sheet_definitions/hair/beards/beards_trimmed.json", "recolor": "gray"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "health", "category": "walkers", "output": "health.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "olive"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "white"},
            {"sheet": SLEEVELESS, "variant": "white"},
            {"sheet": "sheet_definitions/torso/torso_bandages.json", "variant": "white"},
            {"sheet": "sheet_definitions/hair/short/hair_messy2.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "tax", "category": "walkers", "output": "tax.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "taupe"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "charcoal"},
            {"sheet": SLEEVELESS, "variant": "charcoal"},
            {"sheet": CAPE, "variant": "charcoal"},
            {"sheet": "sheet_definitions/torso/waist/belt_formal.json", "variant": "black"},
            {"sheet": "sheet_definitions/hair/short/hair_swoop.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "fire", "category": "walkers", "output": "fire.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": LEGION_SKIRT, "recolor": "brown"},
            {"sheet": SLEEVELESS, "variant": "red"},
            {"sheet": SASH, "variant": "red"},
            {"sheet": "sheet_definitions/hair/short/hair_messy2.json", "recolor": "dark_brown"},
        ],
    },
    # ========== DIEUX (14) ==========
    {
        "id": "demeter", "category": "gods", "output": "demeter.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": ROBE, "variant": "yellow"},
            {"sheet": SASH, "variant": "yellow"},
            {"sheet": "sheet_definitions/hair/long/hair_long.json", "recolor": "blonde"},
            {"sheet": CRYSTAL, "variant": "gold"},
        ],
    },
    {
        "id": "zeus", "category": "gods", "output": "zeus.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": SHIRT, "recolor": "white"},
            {"sheet": "sheet_definitions/head/heads/human/heads_human_male_elderly.json"},
            {"sheet": "sheet_definitions/hair/beards/beards_winter.json", "recolor": "white"},
            {"sheet": CROWN, "variant": "gold"},
            {"sheet": GLOWSWORD, "variant": "blue"},
        ],
    },
    {
        "id": "athena", "category": "gods", "output": "athena.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": CHAIN, "recolor": "bronze"},
            {"sheet": LEGS_ARM, "recolor": "bronze"},
            {"sheet": HELM, "recolor": "bronze"},
            {"sheet": SPEAR, "variant": "bronze"},
            {"sheet": SPARTAN, "variant": "spartan"},
        ],
    },
    {
        "id": "dionysos", "category": "gods", "output": "dionysos.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": PANTS, "recolor": "brown"},
            {"sheet": ROBE, "variant": "purple"},
            {"sheet": "sheet_definitions/hair/curly/hair_curly_long.json", "recolor": "dark_brown"},
            {"sheet": CRYSTAL, "variant": "purple"},
        ],
    },
    {
        "id": "poseidon", "category": "gods", "output": "poseidon.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "sky"},
            {"sheet": PANTS, "recolor": "navy"},
            {"sheet": "sheet_definitions/hair/beards/beards_medium.json", "recolor": "dark_brown"},
            {"sheet": "sheet_definitions/hair/short/hair_messy2.json", "recolor": "dark_brown"},
            {"sheet": TRIDENT, "variant": "gold"},
        ],
    },
    {
        "id": "apollon", "category": "gods", "output": "apollon.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "yellow"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": CROWN, "variant": "gold"},
            {"sheet": "sheet_definitions/hair/long/hair_long.json", "recolor": "gold"},
            {"sheet": STAFF, "variant": "gold"},
        ],
    },
    {
        "id": "hera", "category": "gods", "output": "hera.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": ROBE, "variant": "purple"},
            {"sheet": CROWN, "variant": "gold"},
            {"sheet": "sheet_definitions/hair/xlong/hair_princess.json", "recolor": "black"},
        ],
    },
    {
        "id": "ares", "category": "gods", "output": "ares.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": BOOTS, "variant": "brown"},
            {"sheet": CHAIN, "recolor": "bronze"},
            {"sheet": LEGS_ARM, "recolor": "bronze"},
            {"sheet": HELM, "recolor": "bronze"},
            {"sheet": SWORD, "variant": "bronze"},
            {"sheet": SHIELD, "variant": "bronze"},
        ],
    },
    {
        "id": "hermes", "category": "gods", "output": "hermes.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "sky"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": WINGS, "variant": "white"},
            {"sheet": "sheet_definitions/hair/short/hair_messy2.json", "recolor": "sandy"},
            {"sheet": STAFF, "variant": "gold"},
        ],
    },
    {
        "id": "artemis", "category": "gods", "output": "artemis.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": TUNIC, "variant": "forest"},
            {"sheet": PANTS, "recolor": "forest"},
            {"sheet": "sheet_definitions/hair/braids/hair_ponytail.json", "recolor": "dark_brown"},
            {"sheet": BOW, "variant": "light"},
        ],
    },
    {
        "id": "hephaistos", "category": "gods", "output": "hephaistos.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "olive"},
            {"sheet": BOOTS, "variant": "brown"},
            {"sheet": PANTS, "recolor": "charcoal"},
            {"sheet": SHIRT, "recolor": "charcoal"},
            {"sheet": "sheet_definitions/torso/waist/belt_leather.json", "variant": "brown"},
            {"sheet": "sheet_definitions/hair/beards/beards_beard.json", "recolor": "dark_brown"},
            {"sheet": AXE, "variant": "iron"},
        ],
    },
    {
        "id": "aphrodite", "category": "gods", "output": "aphrodite.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "rose"},
            {"sheet": ROBE, "variant": "rose"},
            {"sheet": SASH, "variant": "rose"},
            {"sheet": "sheet_definitions/hair/long/hair_wavy.json", "recolor": "strawberry"},
        ],
    },
    {
        "id": "hestia", "category": "gods", "output": "hestia.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": ROBE, "variant": "tan"},
            {"sheet": "sheet_definitions/hair/braids/hair_bangs_bun.json", "recolor": "redhead"},
            {"sheet": GLOWSWORD, "variant": "red"},
        ],
    },
    {
        "id": "hades", "category": "gods", "output": "hades.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SHOES, "variant": "black"},
            {"sheet": PANTS, "recolor": "black"},
            {"sheet": SHIRT, "recolor": "black"},
            {"sheet": "sheet_definitions/head/heads/undead/heads_vampire.json"},
            {"sheet": HELM, "recolor": "steel"},
            {"sheet": STAFF, "variant": "steel"},
        ],
    },
    # ========== MONSTRES (5) ==========
    {
        "id": "medusa", "category": "monsters", "output": "medusa.png",
        "body_type": "female",
        "layers": [
            {"sheet": B, "recolor": "green"},
            {"sheet": SAND, "variant": "green"},
            {"sheet": TUNIC, "variant": "green"},
            {"sheet": "sheet_definitions/head/heads/reptile/heads_lizard_female.json", "recolor": "green"},
        ],
    },
    {
        "id": "hydra", "category": "monsters", "output": "hydra.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "dark_green"},
            {"sheet": "sheet_definitions/head/heads/reptile/heads_lizard_male.json", "recolor": "dark_green"},
            {"sheet": TUNIC, "variant": "forest"},
            {"sheet": "sheet_definitions/weapons/polearm/weapon_polearm_scythe.json", "variant": "steel"},
        ],
    },
    {
        "id": "minotaur", "category": "monsters", "output": "minotaur.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "fur_tan"},
            {"sheet": "sheet_definitions/head/heads/beast/heads_minotaur.json", "recolor": "fur_brown"},
            {"sheet": PANTS, "recolor": "brown"},
            {"sheet": AXE, "variant": "steel"},
        ],
    },
    {
        "id": "cyclops", "category": "monsters", "output": "cyclops.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "olive"},
            {"sheet": PANTS, "recolor": "brown"},
            {"sheet": SHIRT, "recolor": "brown"},
            {"sheet": "sheet_definitions/head/eyes/eyes_cyclops.json", "variant": "cyclops"},
            {"sheet": CLUB, "variant": "mace"},
        ],
    },
    {
        "id": "cerberus", "category": "monsters", "output": "cerberus.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "black"},
            {"sheet": "sheet_definitions/head/heads/beast/heads_wolf_male.json", "recolor": "fur_black"},
            {"sheet": PANTS, "recolor": "charcoal"},
            {"sheet": CLUB, "variant": "mace"},
        ],
    },
    {
        "id": "chimera", "category": "monsters", "output": "chimera.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "fur_tan"},
            {"sheet": "sheet_definitions/head/heads/reptile/heads_lizard_male.json", "recolor": "olive"},
            {"sheet": WINGS, "variant": "orange"},
            {"sheet": SLEEVELESS, "variant": "red"},
            {"sheet": FUR_LEGS, "recolor": "brown"},
        ],
    },
    {
        "id": "dragon", "category": "monsters", "output": "dragon.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "dark_green"},
            {"sheet": "sheet_definitions/head/heads/reptile/heads_lizard_male.json", "recolor": "dark_green"},
            {"sheet": WINGS, "variant": "green"},
            {"sheet": SLEEVELESS, "variant": "forest"},
            {"sheet": FUR_LEGS, "recolor": "forest"},
        ],
    },
    {
        "id": "boar", "category": "monsters", "output": "boar.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "fur_tan"},
            {"sheet": "sheet_definitions/head/heads/beast/heads_boarman.json", "recolor": "fur_brown"},
            {"sheet": FUR_LEGS, "recolor": "brown"},
            {"sheet": PANTS, "recolor": "brown"},
        ],
    },
    # ========== HÉROS (8 — inclut ceux du jeu + extras ComfyUI) ==========
    {
        "id": "perseus", "category": "heroes", "output": "perseus.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "white"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": SHIELD, "variant": "silver"},
            {"sheet": DAGGER, "variant": "steel"},
            {"sheet": WINGS, "variant": "white"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "heracles", "category": "heroes", "output": "heracles.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": FUR_LEGS, "recolor": "brown"},
            {"sheet": MANTLE, "variant": "brown"},
            {"sheet": CLUB, "variant": "mace"},
            {"sheet": "sheet_definitions/hair/short/hair_messy2.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "theseus", "category": "heroes", "output": "theseus.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "red"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": SASH, "variant": "red"},
            {"sheet": "sheet_definitions/weapons/sword/weapon_sword_arming.json", "variant": "steel"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "ulysses", "category": "heroes", "output": "ulysses.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "leather"},
            {"sheet": PANTS, "recolor": "brown"},
            {"sheet": MANTLE, "variant": "brown"},
            {"sheet": BOW, "variant": "light"},
            {"sheet": "sheet_definitions/hair/short/hair_unkempt.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "orpheus", "category": "heroes", "output": "orpheus.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": ROBE, "variant": "white"},
            {"sheet": "sheet_definitions/hair/long/hair_long.json", "recolor": "black"},
            {"sheet": STAFF, "variant": "gold"},
        ],
    },
    {
        "id": "bellerophon", "category": "heroes", "output": "bellerophon.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "white"},
            {"sheet": PANTS, "recolor": "white"},
            {"sheet": SPEAR, "variant": "steel"},
            {"sheet": WINGS, "variant": "white"},
        ],
    },
    {
        "id": "jason", "category": "heroes", "output": "jason.png",
        "body_type": "male",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": SAND, "variant": "brown"},
            {"sheet": SHIRT, "recolor": "sky"},
            {"sheet": PANTS, "recolor": "navy"},
            {"sheet": MANTLE, "variant": "sky"},
            {"sheet": SASH, "variant": "gold"},
            {"sheet": "sheet_definitions/hair/short/hair_parted.json", "recolor": "dark_brown"},
        ],
    },
    {
        "id": "achilles", "category": "heroes", "output": "achilles.png",
        "body_type": "muscular",
        "layers": [
            {"sheet": B, "recolor": "light"},
            {"sheet": BOOTS, "variant": "brown"},
            {"sheet": CHAIN, "recolor": "bronze"},
            {"sheet": LEGS_ARM, "recolor": "bronze"},
            {"sheet": HELM, "recolor": "bronze"},
            {"sheet": SWORD, "variant": "bronze"},
            {"sheet": SHIELD, "variant": "bronze"},
        ],
    },
]

for _recipe in RECIPES:
    inject_heads(_recipe)


def main():
    parser = argparse.ArgumentParser(description="Genere les sprites LPC pour Olympos")
    parser.add_argument("--only", nargs="+", metavar=("CATEGORY", "ID"),
                        help="Ex: --only walkers water  |  --only gods zeus")
    parser.add_argument("--list", action="store_true", help="Liste les recettes")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.list:
        for r in RECIPES:
            print(f"{r['category']:10s} {r['id']:12s} -> {r['output']}")
        return

    repo = get_repo()
    print(f"LPC repo : {repo}")

    selected = RECIPES
    if args.only:
        if len(args.only) == 1:
            cat = args.only[0]
            selected = [r for r in RECIPES if r["category"] == cat]
        elif len(args.only) >= 2:
            cat, rid = args.only[0], args.only[1]
            selected = [r for r in RECIPES if r["category"] == cat and r["id"] == rid]

    ok, fail = 0, 0
    manifest = []

    for recipe in selected:
        dest = os.path.join(ROOT, "assets", "characters", recipe["category"], recipe["output"])
        label = f"{recipe['category']}/{recipe['id']}"
        if args.dry_run:
            print(f"[dry-run] {label} -> {dest}")
            continue
        try:
            atlas = generate_character_atlas(recipe, repo=repo)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            atlas.save(dest)
            print(f"OK  {label} ({atlas.size[0]}x{atlas.size[1]})")
            ok += 1
            manifest.append({
                "id": recipe["id"],
                "category": recipe["category"],
                "path": f"assets/characters/{recipe['category']}/{recipe['output']}",
            })
        except Exception as exc:
            fail += 1
            print(f"ERR {label}: {exc}")
            traceback.print_exc()

    manifest_path = os.path.join(ROOT, "assets", "characters", "lpc_manifest.json")
    if manifest and not args.dry_run:
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nTermine : {ok} OK, {fail} erreurs.")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
