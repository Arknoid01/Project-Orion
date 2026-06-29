#!/usr/bin/env python3
"""
Génère toutes les textures terrain via l'API ComfyUI (Flux + LoRA seamless).

Prérequis :
  - ComfyUI lancé (http://127.0.0.1:8188)
  - Flux : flux1-dev (safetensors dans models/unet/ OU .gguf via UnetLoaderGGUF)
  - CLIP : t5xxl + clip_l + ae (auto-détectés depuis ComfyUI)
  - LoRA : models/loras/seamless_texture.safetensors

Usage :
  python tools/comfy_terrain_batch.py
  python tools/comfy_terrain_batch.py --only grass_top stone
  python tools/comfy_terrain_batch.py --dry-run
  python tools/comfy_terrain_batch.py --import-game
  python tools/comfy_terrain_batch.py --workflow tools/comfy_workflows/mon_export_api.json

Prompts : smlstxtr, <subject>, seamless texture  (+ style grec dans config)
"""

from __future__ import annotations

import argparse
import copy
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
DEFAULT_WORKFLOW = os.path.join(ROOT, "tools", "comfy_workflows", "terrain_flux_seamless.api.json")


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
    """Aligne la config sur les modèles réellement présents dans ComfyUI."""
    m = dict(cfg.get("models") or {})
    resolved = dict(m)

    unet_safetensors = model_choices(object_info, "UNETLoader", "unet_name")
    unet_gguf = model_choices(object_info, "UnetLoaderGGUF", "unet_name")
    if unet_safetensors:
        resolved["unet_loader"] = "UNETLoader"
        resolved["unet"] = pick_model(unet_safetensors, m.get("unet"), "flux")
    elif unet_gguf:
        resolved["unet_loader"] = "UnetLoaderGGUF"
        resolved["unet"] = pick_model(unet_gguf, m.get("unet"), "flux")
    else:
        raise SystemExit(
            "Aucun modèle Flux UNET détecté.\n"
            "Place flux1-dev.safetensors dans models/unet/ ou un .gguf Flux dans models/unet/"
        )

    clip1 = model_choices(object_info, "DualCLIPLoader", "clip_name1")
    clip2 = model_choices(object_info, "DualCLIPLoader", "clip_name2")
    resolved["clip_t5"] = pick_model(clip1, m.get("clip_t5"), "t5", "t5xxl")
    resolved["clip_l"] = pick_model(clip2, m.get("clip_l"), "clip_l")
    if resolved["clip_t5"] == resolved["clip_l"] and len(clip1) > 1:
        for name in clip1:
            if name != resolved["clip_l"]:
                resolved["clip_t5"] = name
                break

    vae_list = model_choices(object_info, "VAELoader", "vae_name")
    resolved["vae"] = pick_model(vae_list, m.get("vae"), "ae.safetensors", "ae")

    lora_list = model_choices(object_info, "LoraLoaderModelOnly", "lora_name")
    resolved["lora"] = pick_model(lora_list, m.get("lora"), "seamless")
    if not resolved["lora"]:
        raise SystemExit("LoRA seamless_texture.safetensors introuvable dans models/loras/")

    return resolved


def format_prompt(cfg: dict, subject: str) -> str:
    prefix = cfg.get("prompt_prefix", "smlstxtr").strip()
    suffix = cfg.get("prompt_suffix", "seamless texture").strip()
    parts = [p for p in (prefix, subject.strip(), suffix) if p]
    return ", ".join(parts)


def build_flux_seamless_workflow(
    cfg: dict,
    models: dict,
    positive: str,
    negative: str,
    seed: int,
    filename_prefix: str,
) -> dict:
    """Workflow Flux + LoraLoaderModelOnly (safetensors ou GGUF)."""
    g = cfg["generation"]
    width = g.get("width", 1024)
    height = g.get("height", 1024)
    unet_loader = models.get("unet_loader", "UNETLoader")

    unet_node: dict = {
        "class_type": unet_loader,
        "inputs": {"unet_name": models["unet"]},
    }
    if unet_loader == "UNETLoader":
        unet_node["inputs"]["weight_dtype"] = "default"

    return {
        "10": unet_node,
        "11": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": models["clip_t5"],
                "clip_name2": models["clip_l"],
                "type": "flux",
            },
        },
        "12": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": models["vae"]},
        },
        "20": {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "model": ["10", 0],
                "lora_name": models["lora"],
                "strength_model": models.get("lora_strength", 0.85),
            },
        },
        "21": {
            "class_type": "ModelSamplingFlux",
            "inputs": {
                "model": ["20", 0],
                "max_shift": 1.15,
                "base_shift": 0.5,
                "width": width,
                "height": height,
            },
        },
        "30": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": positive, "clip": ["11", 0]},
        },
        "31": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["11", 0]},
        },
        "32": {
            "class_type": "FluxGuidance",
            "inputs": {"conditioning": ["30", 0], "guidance": g.get("guidance", 3.5)},
        },
        "40": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": 1,
            },
        },
        "50": {
            "class_type": "RandomNoise",
            "inputs": {"noise_seed": seed},
        },
        "51": {
            "class_type": "BasicGuider",
            "inputs": {"model": ["21", 0], "conditioning": ["32", 0]},
        },
        "52": {
            "class_type": "KSamplerSelect",
            "inputs": {"sampler_name": g.get("sampler", "euler")},
        },
        "53": {
            "class_type": "BasicScheduler",
            "inputs": {
                "model": ["21", 0],
                "scheduler": g.get("scheduler", "simple"),
                "steps": g.get("steps", 20),
                "denoise": 1.0,
            },
        },
        "54": {
            "class_type": "SamplerCustomAdvanced",
            "inputs": {
                "noise": ["50", 0],
                "guider": ["51", 0],
                "sampler": ["52", 0],
                "sigmas": ["53", 0],
                "latent_image": ["40", 0],
            },
        },
        "60": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["54", 0], "vae": ["12", 0]},
        },
        "70": {
            "class_type": "SaveImage",
            "inputs": {"images": ["60", 0], "filename_prefix": filename_prefix},
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
        .replace("{{LORA}}", json.dumps(cfg["models"]["lora"])[1:-1])
        .replace("{{LORA_STRENGTH}}", str(cfg["models"].get("lora_strength", 0.85)))
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
    parser = argparse.ArgumentParser(description="Batch textures terrain ComfyUI (Flux + seamless LoRA)")
    parser.add_argument("--config", default=CONFIG_PATH, help="Chemin comfy_terrain_config.json")
    parser.add_argument("--workflow", default=None, help="Export API ComfyUI (.json) optionnel")
    parser.add_argument("--only", nargs="+", metavar="NAME", help="Textures ciblées (ex. grass_top stone)")
    parser.add_argument("--dry-run", action="store_true", help="Affiche prompts sans envoyer à ComfyUI")
    parser.add_argument("--import-game", action="store_true", help="Lance import_flat_textures.py après génération")
    parser.add_argument("--game-size", type=int, default=64, help="Taille import jeu (TERRAIN_FLAT_FACE_PX)")
    parser.add_argument("--list", action="store_true", help="Liste les textures configurées")
    args = parser.parse_args()

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
        print("Textures terrain :")
        for j in cfg.get("textures") or []:
            print(f"  - {j['name']}")
            print(f"      {format_prompt(cfg, j['subject'])}")
        return 0 if args.list else 1

    template = load_workflow_template(cfg, args.workflow)
    use_template = template is not None

    if args.dry_run:
        print(f"ComfyUI : {base}")
        print(f"Mode    : {'workflow externe' if use_template else 'workflow Flux intégré'}")
        try:
            models = resolve_models(cfg, fetch_object_info(base))
            print(f"UNET    : {models['unet_loader']} -> {models['unet']}")
            print(f"CLIP    : {models['clip_t5']} + {models['clip_l']}")
            print(f"VAE     : {models['vae']}")
            print(f"LoRA    : {models['lora']} @ {models.get('lora_strength', 0.85)}")
        except (urllib.error.URLError, SystemExit) as err:
            print(f"Modèles : (ComfyUI offline — {err})")
        print()
        for i, job in enumerate(jobs):
            seed = cfg["generation"].get("seed_base", 42) + i
            pos = format_prompt(cfg, job["subject"])
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
    print(f"UNET : {models['unet_loader']} -> {models['unet']}")
    print(f"CLIP : {models['clip_t5']} + {models['clip_l']}")
    print(f"VAE  : {models['vae']}")
    print(f"LoRA : {models['lora']} @ {models.get('lora_strength', 0.85)}\n")

    ok = 0
    for i, job in enumerate(jobs):
        name = job["name"]
        positive = format_prompt(cfg, job["subject"])
        seed = seed_base + i
        prefix = f"{subfolder}/{name}"

        if use_template:
            workflow = patch_workflow_template(template, cfg, positive, negative, seed, prefix)
        else:
            workflow = build_flux_seamless_workflow(cfg, models, positive, negative, seed, prefix)

        print(f"> {name}")
        print(f"  prompt: {positive}")

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
                    "  Astuce : exporte ton graphe ComfyUI (Flux + seamless LoRA)\n"
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
