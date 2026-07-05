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
     python import_comfy_raw.py --deploy --phase1-culture   # uniquement les 5 lieux culture (sans maisons)

  Textures encore manquantes (carrotFarm, huntingPavilion, domaine…) :

     python comfy_batch_generate.py --list-missing-all
     python comfy_batch_generate.py --gaps-only
     python import_comfy_raw.py --deploy

  Import par numéro olympos_asset (ComfyUI local) :

     python import_comfy_raw.py --assign 81:carrotFarm.png 82:huntingPavilion.png --deploy

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
import tempfile

import requests

from comfy_batch_generate import (
    ASSETS,
    CATEGORY_DEFAULTS,
    COMFY_URL,
    OUTPUT_DIR,
    PHASE1_CULTURE_ASSETS,
    TILE_MODE,
    finalize_asset,
    generate_tile_procedural,
)

PHASE1_CULTURE_OUTPUTS = {e["output"] for e in PHASE1_CULTURE_ASSETS}

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


def comfy_asset_filename(asset_id):
    return f"olympos_asset_{int(asset_id):05d}_.png"


def fetch_comfy_output(filename, comfy_url=None):
    base = (comfy_url or COMFY_URL).rstrip("/")
    resp = requests.get(
        f"{base}/view",
        params={"filename": filename, "type": "output"},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.content


def parse_assignments(items):
    """['81:carrotFarm.png', '82:huntingPavilion.png'] -> [(81, 'carrotFarm.png'), ...]"""
    out = []
    for item in items:
        if ":" not in item:
            raise SystemExit(f"Format --assign invalide : {item} (attendu NUM:fichier.png)")
        left, name = item.split(":", 1)
        name = name if name.endswith(".png") else f"{name}.png"
        out.append((int(left.strip()), name))
    return out


def import_assigned_ids(assignments, comfy_url=None, deploy=True):
    imported = []
    for asset_id, output_name in assignments:
        entry = entry_for_output(output_name)
        filename = comfy_asset_filename(asset_id)
        print(f"-> {filename} -> {entry['category']}/{entry['output']}")
        raw_bytes = fetch_comfy_output(filename, comfy_url)
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        try:
            dst = process_entry(tmp_path, entry)
            imported.append(dst)
            print(f"OK  {entry['category']}/{entry['output']}")
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    if deploy and imported:
        print()
        deploy_to_assets(only_outputs={name for _, name in assignments})
    return imported


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


def deploy_to_assets(include_tiles=False, only_outputs=None, skip_categories=None):
    """Copie sprites_out vers assets/. Les tuiles de sol ne sont pas écrasées par défaut
    (utilisez process_terrain_textures.py pour les sols marketing).
    only_outputs : set de noms de fichiers (ex. agora.png) — ne copie que ceux-là."""
    skip_categories = skip_categories or set()
    copied = 0
    for category, game_dir in GAME_DIRS.items():
        if category == "tiles" and not include_tiles:
            continue
        if category in skip_categories:
            continue
        src_dir = os.path.join(OUTPUT_DIR, category)
        if not os.path.isdir(src_dir):
            continue
        os.makedirs(game_dir, exist_ok=True)
        for name in os.listdir(src_dir):
            if not name.lower().endswith(".png"):
                continue
            if only_outputs is not None and name not in only_outputs:
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
        "--phase1-culture",
        action="store_true",
        help="Avec --deploy : uniquement agora, theatre, gymnasium, stoa, academy (ne touche pas aux maisons ni aux autres bâtiments)",
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
    parser.add_argument(
        "--assign",
        nargs="+",
        metavar="ID:FICHIER",
        help="Importe olympos_asset_NNNNN_.png depuis ComfyUI (ex: 81:carrotFarm.png)",
    )
    parser.add_argument(
        "--comfy-url",
        default=None,
        help=f"URL ComfyUI pour --assign (défaut: {COMFY_URL})",
    )
    args = parser.parse_args()

    if args.assign:
        assignments = parse_assignments(args.assign)
        print(f"Import assigné depuis ComfyUI ({args.comfy_url or COMFY_URL})\n")
        import_assigned_ids(assignments, comfy_url=args.comfy_url, deploy=not args.no_deploy)
        print("\nTerminé.")
        return

    if args.deploy and not args.from_comfy and not args.from_spare and not args.tiles:
        if args.phase1_culture:
            deploy_to_assets(
                include_tiles=args.with_tiles,
                only_outputs=PHASE1_CULTURE_OUTPUTS,
                skip_categories={"houses"},
            )
        else:
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
