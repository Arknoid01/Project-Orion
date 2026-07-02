# Modes rendu terrain

## Mode actuel — cubes Three.js (Minecraft-style)

Textures **carrées seamless** dans `assets/tiles/generated_mediterranean/` :

| Fichier | Usage cube |
|---------|------------|
| `grass.png` | Dessus herbe / colline |
| `forest.png` | Dessus forêt |
| `wheat.png` | Dessus blé |
| `sand.png` | Sable (toutes faces) |
| `dirt.png` | Côtés herbe / colline / blé / forêt |
| `rock.png` | Roche (toutes faces) |
| `marble.png` | Marbre (toutes faces) |
| `water.png` | Eau (toutes faces) |

Config moteur : `js/threeRenderer.js` → `THREE_TERRAIN_TEX_DEFS`

## Pipeline ComfyUI (génération)

Prérequis : ComfyUI + SDXL Nuclear + LoRA `sxz-texture-sdxl.safetensors`

Prompt : `texture of {surface}, {subject}, seamless`

```bash
# Voir la liste complète + prompts méditerranéens
python tools/comfy_terrain_batch.py --list

# Prévisualiser les prompts sans GPU
python tools/comfy_terrain_batch.py --dry-run

# Générer les 8 textures (1024×1024 → source/)
python tools/comfy_terrain_batch.py

# Une ou plusieurs textures
python tools/comfy_terrain_batch.py --only grass wheat water

# Générer + déployer carrés 64×64 dans le jeu
python tools/comfy_terrain_batch.py --import-game

# Vérifier que tout est présent et carré
python tools/import_flat_textures.py --check
```

Chemins :
- Export Comfy → `assets/textures/flat/source/{grass,forest,...}.png`
- Jeu Three.js → `assets/tiles/generated_mediterranean/{grass,forest,...}.png`

Puis **Ctrl+F5** + nouvelle partie.

## Ancien mode 2D flat (iso)

```bash
python tools/import_flat_textures.py --legacy-flat
```

Écrit dans `assets/textures/flat/game/` avec noms legacy (`grass_top`, etc.).

## Retour arrière

Les PNG procéduraux Three.js restent le fallback si un fichier manque.
