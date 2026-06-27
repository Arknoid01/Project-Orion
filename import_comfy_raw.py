"""
Importe les PNG bruts de ComfyUI et applique le post-traitement du jeu
(détourage fond blanc, redimensionnement) sans relancer la génération IA.

Usage typique après un batch ComfyUI dont la sauvegarde a échoué :

  1. Laissez ComfyUI terminer toutes les générations.
  2. Copiez le dossier output de ComfyUI (fichiers olympos_asset_*.png)
     OU placez vos PNG renommés dans comfy_raw/<category>/<output>.
  3. Lancez :

     python import_comfy_raw.py --from-comfy "C:\\chemin\\vers\\ComfyUI\\output"
     python import_comfy_raw.py --deploy          # copie sprites_out -> assets/

  Remplacer des sprites manquants / supprimés par les PNG surplus ComfyUI
  (olympos_asset_00030+, ~30 fichiers libres après le batch de 29) :

     python import_comfy_raw.py --from-spare "C:\\...\\ComfyUI\\output"
     python import_comfy_raw.py --from-spare "C:\\...\\output" --replace winery.png temple.png
     python import_comfy_raw.py --from-spare "C:\\...\\output" --deploy

  Mode manuel (fichiers déjà renommés) :

     comfy_raw/buildings/tradingPost.png
     comfy_raw/buildings/grandTemple.png
     ...
     python import_comfy_raw.py
     python import_comfy_raw.py --deploy
"""

import argparse
import glob
import os
import re
import shutil
import sys

from comfy_batch_generate import (
    ASSETS,
    CATEGORY_DEFAULTS,
    OUTPUT_DIR,
    TILE_MODE,
    finalize_asset,
    generate_tile_procedural,
)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(SCRIPT_DIR, "comfy_raw")
GAME_DIRS = {
    "buildings": os.path.join(SCRIPT_DIR, "assets", "buildings"),
    "houses": os.path.join(SCRIPT_DIR, "assets", "houses"),
    "tiles": os.path.join(SCRIPT_DIR, "assets", "tiles"),
}


def ai_assets():
    """Assets qui passent par ComfyUI (exclut les tuiles procédurales)."""
    return [
        e for e in ASSETS
        if not (e["category"] == "tiles" and TILE_MODE == "PROCEDURAL")
    ]


def process_entry(raw_path, entry):
    category = entry["category"]
    defaults = CATEGORY_DEFAULTS[category]
    out_dir = os.path.join(OUTPUT_DIR, category)
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, entry["output"])
    final_size = entry.get("final_size", defaults["final_size"])

    with open(raw_path, "rb") as f:
        raw_bytes = f.read()

    finalize_asset(
        raw_bytes,
        output_path,
        remove_bg=defaults["remove_bg"],
        iso_tile=defaults["iso_tile"],
        final_size=final_size,
    )
    return output_path


def import_from_folder(raw_root):
    """comfy_raw/buildings/farm.png, etc."""
    imported = []
    missing = []
    for entry in ai_assets():
        src = os.path.join(raw_root, entry["category"], entry["output"])
        if not os.path.isfile(src):
            missing.append(f"{entry['category']}/{entry['output']}")
            continue
        dst = process_entry(src, entry)
        imported.append(dst)
        print(f"OK  {entry['category']}/{entry['output']} <- {src}")
    return imported, missing


def sort_comfy_files(files):
    def key(path):
        m = re.search(r"(\d+)", os.path.basename(path))
        return int(m.group(1)) if m else 0

    return sorted(files, key=key)


def comfy_files(comfy_output_dir):
    pattern = os.path.join(comfy_output_dir, "olympos_asset*.png")
    files = sort_comfy_files(glob.glob(pattern))
    if not files:
        print(f"Aucun fichier olympos_asset*.png dans : {comfy_output_dir}")
        sys.exit(1)
    return files


def entry_for_output(name):
    name = name if name.endswith(".png") else f"{name}.png"
    for entry in ai_assets():
        if entry["output"] == name:
            return entry
    raise SystemExit(f"Asset inconnu dans ASSETS : {name}")


def import_from_spare(comfy_output_dir, replace_names=None, deploy_names=None):
    """Utilise les PNG ComfyUI au-delà des 29 premiers pour remplir les sprites manquants."""
    files = comfy_files(comfy_output_dir)
    targets = ai_assets()
    spare = files[len(targets):]
    print(f"{len(files)} PNG ComfyUI, {len(targets)} slots batch, {len(spare)} surplus.\n")
    if not spare:
        sys.exit("Aucun fichier surplus (numéro > nombre d'assets batch).")

    by_output = {e["output"]: e for e in targets}
    todo = []

    if replace_names:
        for name in replace_names:
            todo.append(entry_for_output(name))
    else:
        for entry in targets:
            out_path = os.path.join(OUTPUT_DIR, entry["category"], entry["output"])
            if not os.path.isfile(out_path):
                todo.append(entry)

    if not todo:
        print("Rien à remplacer (sprites_out complet). Utilisez --replace nom.png …")
        return []

    if len(spare) < len(todo):
        sys.exit(
            f"Pas assez de surplus ({len(spare)}) pour {len(todo)} sprite(s) à remplacer."
        )

    imported = []
    for entry, raw_path in zip(todo, spare):
        dst = process_entry(raw_path, entry)
        imported.append(dst)
        print(f"OK  {entry['category']}/{entry['output']} <- {os.path.basename(raw_path)}")

    if deploy_names is not False:
        names = deploy_names if deploy_names else [e["output"] for e in todo]
        print()
        for name in names:
            entry = by_output[name if name.endswith(".png") else f"{name}.png"]
            src = os.path.join(OUTPUT_DIR, entry["category"], entry["output"])
            dst = os.path.join(GAME_DIRS[entry["category"]], entry["output"])
            if not os.path.isfile(src):
                print(f"SKIP {entry['output']} (sprites_out absent)")
                continue
            shutil.copy2(src, dst)
            print(f"copié -> assets/{entry['category']}/{entry['output']}")

    return imported


def import_from_comfy_output(comfy_output_dir):
    """Associe olympos_asset_*.png (tri par numéro) à l'ordre ASSETS."""
    files = comfy_files(comfy_output_dir)

    targets = ai_assets()
    print(f"{len(files)} PNG trouvé(s) dans ComfyUI, {len(targets)} assets attendus.\n")

    if len(files) < len(targets):
        print("ATTENTION : moins de fichiers que d'assets — seuls les premiers seront importés.")
    elif len(files) > len(targets):
        print("ATTENTION : plus de fichiers que d'assets — les surplus seront ignorés.")

    imported = []
    for entry, raw_path in zip(targets, files):
        dst = process_entry(raw_path, entry)
        imported.append(dst)
        print(f"OK  {entry['category']}/{entry['output']} <- {os.path.basename(raw_path)}")

    return imported, []


def generate_procedural_tiles():
    for entry in ASSETS:
        if entry["category"] == "tiles" and TILE_MODE == "PROCEDURAL":
            generate_tile_procedural(entry)
            print(f"OK  tiles/{entry['output']} (procédural)")


def deploy_to_assets(include_tiles=False):
    """Copie sprites_out vers assets/. Les tuiles de sol ne sont pas écrasées par défaut
    (utilisez process_terrain_textures.py pour les sols marketing)."""
    copied = 0
    for category, game_dir in GAME_DIRS.items():
        if category == "tiles" and not include_tiles:
            continue
        src_dir = os.path.join(OUTPUT_DIR, category)
        if not os.path.isdir(src_dir):
            continue
        os.makedirs(game_dir, exist_ok=True)
        for name in os.listdir(src_dir):
            if not name.lower().endswith(".png"):
                continue
            shutil.copy2(os.path.join(src_dir, name), os.path.join(game_dir, name))
            copied += 1
            print(f"copié -> assets/{category}/{name}")
    skipped = "" if include_tiles else " (tuiles ignorées — lancez process_terrain_textures.py)"
    print(f"\n{copied} sprite(s) déployé(s) dans assets/.{skipped}")


def main():
    parser = argparse.ArgumentParser(description="Importe et post-traite les PNG ComfyUI.")
    parser.add_argument(
        "--from-comfy",
        metavar="DIR",
        help="Dossier output de ComfyUI (olympos_asset_*.png, ordre = ASSETS)",
    )
    parser.add_argument(
        "--raw-dir",
        default=RAW_DIR,
        help=f"Dossier avec sous-dossiers buildings/houses/tiles (défaut: {RAW_DIR})",
    )
    parser.add_argument(
        "--deploy",
        action="store_true",
        help="Copie sprites_out/buildings et houses vers assets/ (sans import)",
    )
    parser.add_argument(
        "--with-tiles",
        action="store_true",
        help="Inclure aussi sprites_out/tiles (écrase les sols marketing)",
    )
    parser.add_argument(
        "--from-spare",
        metavar="DIR",
        help="Importe les PNG surplus ComfyUI (00030+) vers sprites manquants",
    )
    parser.add_argument(
        "--replace",
        nargs="+",
        metavar="FICHIER",
        help="Avec --from-spare : force le remplacement de ces sprites (ex: winery.png)",
    )
    parser.add_argument(
        "--no-deploy",
        action="store_true",
        help="Avec --from-spare : ne copie pas vers assets/ après import",
    )
    parser.add_argument(
        "--tiles",
        action="store_true",
        help="Regénère aussi les tuiles procédurales (grass, wheat…)",
    )
    args = parser.parse_args()

    if args.deploy and not args.from_comfy and not args.from_spare and not args.tiles:
        deploy_to_assets(include_tiles=args.with_tiles)
        return

    print(f"Dossier de sortie : {OUTPUT_DIR}\n")

    if args.from_spare:
        import_from_spare(
            os.path.expanduser(args.from_spare),
            replace_names=args.replace,
            deploy_names=False if args.no_deploy else None,
        )
        print("\nTerminé.")
        return
    elif args.from_comfy:
        import_from_comfy_output(os.path.expanduser(args.from_comfy))
    else:
        imported, missing = import_from_folder(args.raw_dir)
        if missing:
            print(f"\n{len(missing)} fichier(s) absent(s) dans {args.raw_dir} :")
            for m in missing:
                print(f"  - {m}")

    if args.tiles:
        print()
        generate_procedural_tiles()

    if args.deploy:
        print()
        deploy_to_assets(include_tiles=args.with_tiles)

    print("\nTerminé. Vérifiez sprites_out/ puis lancez --deploy si ce n'est pas déjà fait.")


if __name__ == "__main__":
    main()
