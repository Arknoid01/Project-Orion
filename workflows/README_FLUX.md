# Workflow ComfyUI — Flux (bâtiments Olympos)

## Fichier à importer dans ComfyUI

**`building_flux_txt2img.json`** — format interface ComfyUI (Load / glisser-déposer)

Alternative API (scripts Python uniquement) : **`building_flux_txt2img.api.json`**

## Import

1. Ouvre ComfyUI
2. Menu **Load** (ou glisse le fichier `.json` sur le canvas)
3. Choisis `workflows/building_flux_txt2img.json`

## Prérequis

- Custom node **[ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)** (node `UnetLoaderGGUF`)
- Modèles dans ComfyUI :
  - `flux1-dev-Q4_K_S.gguf` (unet / gguf)
  - `t5xxl_fp8_e4m3fn.safetensors` (clip)
  - `clip_l.safetensors` (clip)
  - `ae.safetensors` (vae)
  - `1751268368.safetensors` (lora, strength 0.8)

Référence : constantes `FLUX_*` dans `comfy_batch_generate.py`.

## Réglages

| Paramètre | Valeur |
|-----------|--------|
| Résolution | 512×512 |
| Steps | 30 |
| Sampler | euler / simple |
| CFG (KSampler) | 1.0 |
| Flux Guidance | 3.5 |
| LoRA strength | 0.8 |

## img2img

Le mode img2img (guide PNG) n’est pas exporté en JSON UI : il est construit dynamiquement par `build_workflow_flux()` dans `comfy_batch_generate.py` (nodes LoadImage + VAEEncode).
