#!/usr/bin/env python3
"""
Genere les textures terrain carrees (style Minecraft) via ComfyUI (SDXL + LoRA texture).

Prerequis :
  - ComfyUI lance (http://127.0.0.1:8188)
  - Checkpoint : models/checkpoints/sdxlNuclearGeneralPurposeV3Semi_v30.safetensors
  - LoRA       : models/loras/sxz-texture-sdxl.safetensors

Prompt : texture of {surface}, {subject}, seamless

Usage :
  python tools/comfy_terrain_batch.py --list
  python tools/comfy_terrain_batch.py --dry-run
  python tools/comfy_terrain_batch.py
  python tools/comfy_terrain_batch.py --only grass wheat water
  python tools/comfy_terrain_batch.py --import-game

Config : tools/comfy_terrain_config.json
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "tools", "comfy_terrain_config.json")
SOURCE_DIR = os.path.join(ROOT, "assets", "textures", "flat", "source")
DEFAULT_WORKFLOW = os.path.join(ROOT, "tools", "comfy_workflows", "terrain_sdxl_texture.api.json")

TERRAIN_BACKEND = "sdxl"
SCRIPT_VERSION = "sdxl-nuclear-sxz-2026-07-02-cfg7"
FORBIDDEN_FLUX_NODES = frozenset({
    "DualCLIPLoader",
    "UNETLoader",
    "UnetLoaderGGUF",
    "FluxGuidance",
    "ModelSamplingFlux",
    "EmptySD3LatentImage",
    "SamplerCustomAdvanced",
    "BasicGuider",
    "RandomNoise",
})


def print_banner() -> None:
    print("=" * 60)
    print(f"  ORION terrain batch — BACKEND {TERRAIN_BACKEND.upper()}")
    print(f"  Version : {SCRIPT_VERSION}")
    print(f"  Script  : {os.path.abspath(__file__)}")
    print("  (PAS comfy_batch_generate.py — celui-la utilise Flux pour les batiments)")
    print("=" * 60)


def workflow_node_types(workflow: dict) -> set[str]:
    return {
        n.get("class_type")
        for n in workflow.values()
        if isinstance(n, dict) and n.get("class_type")
    }


def assert_sdxl_workflow(workflow: dict) -> None:
    types = workflow_node_types(workflow)
    flux_hits = types & FORBIDDEN_FLUX_NODES
    if flux_hits:
        raise SystemExit(
            "ERREUR : workflow Flux detecte dans la file ComfyUI.\n"
            f"  Nodes Flux : {', '.join(sorted(flux_hits))}\n"
            "  Cause probable : --workflow pointe vers un export Flux ancien.\n"
            "  Relance SANS --workflow, ou avec un export SDXL.\n"
            f"  Script attendu : {os.path.abspath(__file__)}"
        )
    if "CheckpointLoaderSimple" not in types:
        raise SystemExit(
            "ERREUR : workflow sans CheckpointLoaderSimple (pas SDXL).\n"
            f"  Nodes : {', '.join(sorted(types))}"
        )
    if "LoraLoader" not in types:
        raise SystemExit(
            "ERREUR : workflow sans LoraLoader.\n"
            f"  Nodes : {', '.join(sorted(types))}"
        )


def load_config(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def comfy_base(cfg: dict) -> str:
    return f"http://{cfg['comfy_host']}:{cfg.get('comfy_port', 8188)}"


def api_get(base: str, path: str) -> bytes:
    with urllib.request.urlopen(base + path, timeout=30) as resp:
        return resp.read()


def api_post_json(base: str, path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        base + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def check_comfy(base: str) -> None:
    try:
        api_get(base, "/system_stats")
    except (urllib.error.URLError, TimeoutError) as err:
        raise SystemExit(
            f"ComfyUI inaccessible sur {base}\n"
            f"Lance ComfyUI puis réessaie. ({err})"
        ) from err


def fetch_object_info(base: str) -> dict:
    return json.loads(api_get(base, "/object_info").decode("utf-8"))


def model_choices(object_info: dict, node: str, field: str) -> list[str]:
    node_def = object_info.get(node, {})
    spec = node_def.get("input", {}).get("required", {}).get(field)
    if not spec or not isinstance(spec, list) or not spec:
        return []
    first = spec[0]
    return list(first) if isinstance(first, list) else []


def pick_model(candidates: list[str], preferred: str | None, *hints: str) -> str | None:
    if not candidates:
        return None
    if preferred and preferred in candidates:
        return preferred
    lowered = [(c, c.lower()) for c in candidates]
    for hint in hints:
        h = hint.lower()
        for name, low in lowered:
            if h in low:
                return name
    return candidates[0]


def resolve_models(cfg: dict, object_info: dict) -> dict:
    """Aligne checkpoint + LoRA SDXL sur les modeles presents dans ComfyUI."""
    m = dict(cfg.get("models") or {})
    resolved = dict(m)

    ckpt_list = model_choices(object_info, "CheckpointLoaderSimple", "ckpt_name")
    resolved["checkpoint"] = pick_model(
        ckpt_list,
        m.get("checkpoint"),
        "nuclear",
        "sdxl",
    )
    if not resolved["checkpoint"]:
        raise SystemExit(
            "Aucun checkpoint SDXL detecte.\n"
            "Place sdxlNuclearGeneralPurposeV3Semi_v30.safetensors dans models/checkpoints/"
        )

    lora_list = model_choices(object_info, "LoraLoader", "lora_name")
    resolved["lora"] = pick_model(
        lora_list,
        m.get("lora"),
        "sxz",
        "texture",
    )
    if not resolved["lora"]:
        raise SystemExit("LoRA sxz-texture-sdxl.safetensors introuvable dans models/loras/")

    strength = m.get("lora_strength", 0.9)
    resolved["lora_strength"] = strength
    resolved["lora_strength_clip"] = m.get("lora_strength_clip", strength)
    return resolved


def format_prompt(cfg: dict, job: dict) -> str:
    template = cfg.get("prompt_template", "texture of {surface}, {subject}, seamless")
    surface = (job.get("surface") or job.get("name") or "terrain").strip()
    subject = (job.get("subject") or "").strip()
    try:
        return template.format(surface=surface, subject=subject).strip()
    except KeyError:
        parts = [p for p in (surface, subject, "seamless") if p]
        return ", ".join(parts)


def build_sdxl_texture_workflow(
    cfg: dict,
    models: dict,
    positive: str,
    negative: str,
    seed: int,
    filename_prefix: str,
) -> dict:
    """Workflow SDXL : CheckpointLoaderSimple + LoraLoader + KSampler."""
    g = cfg["generation"]
    width = g.get("width", 1024)
    height = g.get("height", 1024)
    lora_strength = models.get("lora_strength", 0.9)
    lora_clip = models.get("lora_strength_clip", lora_strength)

    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": models["checkpoint"]},
        },
        "5": {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": models["lora"],
                "strength_model": lora_strength,
                "strength_clip": lora_clip,
                "model": ["4", 0],
                "clip": ["4", 1],
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["5", 1]},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["5", 1]},
        },
        "13": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": g.get("steps", 30),
                "cfg": g.get("cfg", 7.0),
                "sampler_name": g.get("sampler", "euler_ancestral"),
                "scheduler": g.get("scheduler", "normal"),
                "denoise": 1.0,
                "model": ["5", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["13", 0],
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "70": {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": filename_prefix},
        },
    }


def is_api_workflow(data: dict) -> bool:
    """True si le JSON ressemble à un export API ComfyUI (noeuds avec class_type)."""
    return any(isinstance(v, dict) and "class_type" in v for v in data.values())


def load_workflow_template(cfg: dict, workflow_path: str | None) -> dict | None:
    candidates: list[str] = []
    if workflow_path:
        candidates.append(workflow_path)
    if cfg.get("workflow_file"):
        candidates.append(cfg["workflow_file"])
    candidates.append(DEFAULT_WORKFLOW)

    for rel in candidates:
        path = rel if os.path.isabs(rel) else os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            continue
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if is_api_workflow(data):
            flux = workflow_node_types(data) & FORBIDDEN_FLUX_NODES
            if flux:
                print(
                    f"ATTENTION : workflow externe ignore (Flux) : {path}\n"
                    f"  Nodes : {', '.join(sorted(flux))}",
                    file=sys.stderr,
                )
                continue
            return data
    return None


def patch_workflow_template(
    template: dict,
    cfg: dict,
    positive: str,
    negative: str,
    seed: int,
    filename_prefix: str,
) -> dict:
    """Patch un export API ComfyUI via placeholders ou patch_nodes."""
    raw = json.dumps(template)
    raw = (
        raw.replace("{{POSITIVE}}", json.dumps(positive)[1:-1])
        .replace("{{NEGATIVE}}", json.dumps(negative)[1:-1])
        .replace("{{SEED}}", str(seed))
        .replace("{{FILENAME_PREFIX}}", json.dumps(filename_prefix)[1:-1])
        .replace("{{CHECKPOINT}}", json.dumps(cfg["models"]["checkpoint"])[1:-1])
        .replace("{{LORA}}", json.dumps(cfg["models"]["lora"])[1:-1])
        .replace("{{LORA_STRENGTH}}", str(cfg["models"].get("lora_strength", 0.9)))
        .replace("{{LORA_STRENGTH_CLIP}}", str(cfg["models"].get("lora_strength_clip", cfg["models"].get("lora_strength", 0.9))))
    )
    workflow = json.loads(raw)

    patch = cfg.get("patch_nodes") or {}
    if patch.get("positive") and patch["positive"] in workflow:
        workflow[patch["positive"]]["inputs"]["text"] = positive
    if patch.get("negative") and patch["negative"] in workflow:
        workflow[patch["negative"]]["inputs"]["text"] = negative
    if patch.get("seed") and patch["seed"] in workflow:
        node = workflow[patch["seed"]]
        inputs = node.get("inputs", {})
        if "noise_seed" in inputs:
            inputs["noise_seed"] = seed
        elif "seed" in inputs:
            inputs["seed"] = seed
    if patch.get("filename_prefix") and patch["filename_prefix"] in workflow:
        workflow[patch["filename_prefix"]]["inputs"]["filename_prefix"] = filename_prefix

    return workflow


def queue_prompt(base: str, workflow: dict, client_id: str) -> str:
    result = api_post_json(base, "/prompt", {"prompt": workflow, "client_id": client_id})
    if "error" in result:
        raise RuntimeError(json.dumps(result["error"], ensure_ascii=False, indent=2))
    prompt_id = result.get("prompt_id")
    if not prompt_id:
        raise RuntimeError(f"Pas de prompt_id : {result}")
    return prompt_id


def wait_for_history(base: str, prompt_id: str, timeout_s: float = 600) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            raw = api_get(base, f"/history/{prompt_id}")
            history = json.loads(raw.decode("utf-8"))
        except urllib.error.HTTPError:
            time.sleep(1.0)
            continue
        if prompt_id in history:
            return history[prompt_id]
        time.sleep(1.0)
    raise TimeoutError(f"Timeout en attente de {prompt_id}")


def download_image(base: str, filename: str, subfolder: str, folder_type: str) -> bytes:
    params = urllib.parse.urlencode({
        "filename": filename,
        "subfolder": subfolder,
        "type": folder_type,
    })
    return api_get(base, f"/view?{params}")


def save_outputs(base: str, history_entry: dict, dest_path: str) -> bool:
    outputs = history_entry.get("outputs") or {}
    saved = False
    for node_out in outputs.values():
        for img in node_out.get("images") or []:
            data = download_image(
                base,
                img["filename"],
                img.get("subfolder", ""),
                img.get("type", "output"),
            )
            os.makedirs(os.path.dirname(dest_path), exist_ok=True)
            with open(dest_path, "wb") as f:
                f.write(data)
            saved = True
            break
        if saved:
            break
    return saved


def run_import_game(size: int) -> None:
    script = os.path.join(ROOT, "tools", "import_flat_textures.py")
    subprocess.run(
        [sys.executable, script, "--size", str(size), "--force"],
        cwd=ROOT,
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch textures terrain ComfyUI (SDXL + sxz-texture LoRA)")
    parser.add_argument("--config", default=CONFIG_PATH, help="Chemin comfy_terrain_config.json")
    parser.add_argument("--workflow", default=None, help="Export API ComfyUI (.json) optionnel")
    parser.add_argument("--only", nargs="+", metavar="NAME", help="Textures ciblées (ex. grass wheat water)")
    parser.add_argument("--dry-run", action="store_true", help="Affiche prompts sans envoyer à ComfyUI")
    parser.add_argument("--import-game", action="store_true", help="Déploie vers assets/tiles/generated_mediterranean/")
    parser.add_argument("--game-size", type=int, default=64, help="Taille carrée import jeu (px)")
    parser.add_argument("--list", action="store_true", help="Liste les textures configurées")
    parser.add_argument("--version", action="store_true", help="Affiche version + chemin du script")
    args = parser.parse_args()

    if args.version:
        print_banner()
        print(f"Config : {CONFIG_PATH}")
        return 0

    print_banner()

    cfg = load_config(args.config)
    base = comfy_base(cfg)
    negative = cfg.get("negative", "")

    jobs = cfg.get("textures") or []
    if args.only:
        wanted = set(args.only)
        jobs = [j for j in jobs if j["name"] in wanted]
        missing = wanted - {j["name"] for j in jobs}
        if missing:
            print(f"Inconnus dans config : {', '.join(sorted(missing))}", file=sys.stderr)

    if args.list or not jobs:
        print("Textures terrain (cubes Three.js — carrées seamless) :")
        print(f"  Source Comfy  : {SOURCE_DIR}")
        print(f"  Déploiement   : assets/tiles/generated_mediterranean/")
        print()
        for j in cfg.get("textures") or []:
            print(f"  - {j['name']}.png")
            print(f"      {format_prompt(cfg, j)}")
        print()
        print("Usage Three.js (threeRenderer.js) :")
        print("  grass/hill -> grass.png (top) + dirt.png (cotes)")
        print("  wheat      -> wheat.png + dirt.png")
        print("  forest     -> forest.png + dirt.png")
        print("  sand/rock/marble/water -> meme texture sur toutes les faces")
        return 0 if args.list else 1

    template = load_workflow_template(cfg, args.workflow)
    use_template = template is not None

    if args.dry_run:
        print(f"ComfyUI : {base}")
        print(f"Mode    : {'workflow externe SDXL' if use_template else 'workflow SDXL integre'}")
        try:
            models = resolve_models(cfg, fetch_object_info(base))
            print(f"Checkpoint : {models['checkpoint']}")
            print(f"LoRA       : {models['lora']} @ {models.get('lora_strength', 0.9)}")
            g = cfg.get("generation") or {}
            print(f"Steps/CFG  : {g.get('steps', 30)} steps, cfg {g.get('cfg', 7.0)}, sampler {g.get('sampler', 'euler_ancestral')}")
        except (urllib.error.URLError, SystemExit) as err:
            print(f"Modeles : (ComfyUI offline — {err})")
        print()
        for i, job in enumerate(jobs):
            seed = cfg["generation"].get("seed_base", 42) + i
            pos = format_prompt(cfg, job)
            print(f"[{job['name']}] seed={seed}")
            print(f"  + {pos}")
            print(f"  - {negative}\n")
        return 0

    check_comfy(base)
    object_info = fetch_object_info(base)
    models = resolve_models(cfg, object_info)
    os.makedirs(SOURCE_DIR, exist_ok=True)

    client_id = str(uuid.uuid4())
    subfolder = cfg.get("output_subfolder", "orion_terrain")
    seed_base = cfg["generation"].get("seed_base", 42)

    print(f"ComfyUI {base} — {len(jobs)} texture(s)")
    print(f"Checkpoint : {models['checkpoint']}")
    print(f"LoRA       : {models['lora']} @ {models.get('lora_strength', 0.9)}")
    g = cfg.get("generation") or {}
    print(f"Steps/CFG  : {g.get('steps', 30)} steps, cfg {g.get('cfg', 7.0)}, sampler {g.get('sampler', 'euler_ancestral')}\n")

    ok = 0
    for i, job in enumerate(jobs):
        name = job["name"]
        positive = format_prompt(cfg, job)
        seed = seed_base + i
        prefix = f"{subfolder}/{name}"

        if use_template:
            workflow = patch_workflow_template(template, cfg, positive, negative, seed, prefix)
        else:
            workflow = build_sdxl_texture_workflow(cfg, models, positive, negative, seed, prefix)

        assert_sdxl_workflow(workflow)
        node_list = ", ".join(sorted(workflow_node_types(workflow)))

        print(f"> {name}")
        print(f"  prompt: {positive}")
        print(f"  nodes : {node_list}")

        try:
            prompt_id = queue_prompt(base, workflow, client_id)
            entry = wait_for_history(base, prompt_id)
            dest = os.path.join(SOURCE_DIR, f"{name}.png")
            if save_outputs(base, entry, dest):
                print(f"  OK sauvegarde : {dest}\n")
                ok += 1
            else:
                print(f"  ERREUR : aucune image dans la reponse ComfyUI\n", file=sys.stderr)
        except (RuntimeError, TimeoutError, urllib.error.URLError) as err:
            print(f"  ERREUR : {err}\n", file=sys.stderr)
            if not use_template:
                print(
                    "  Astuce : exporte ton graphe ComfyUI SDXL + sxz-texture-sdxl\n"
                    "  en « Save (API Format) », place-le dans tools/comfy_workflows/\n"
                    "  et relance avec --workflow chemin/vers/export.api.json\n",
                    file=sys.stderr,
                )

    print(f"Terminé : {ok}/{len(jobs)} textures dans {SOURCE_DIR}")

    if args.import_game and ok > 0:
        print(f"\nImport jeu ({args.game_size}px)…")
        run_import_game(args.game_size)
        print("Ctrl+F5 + nouvelle partie dans le navigateur.")

    return 0 if ok == len(jobs) else 1


if __name__ == "__main__":
    sys.exit(main())
