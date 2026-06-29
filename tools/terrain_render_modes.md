# Modes rendu terrain (empilement Lego)

Configuration dans `js/config.js`.

## Mode validé — nature PNG (fallback)

```javascript
const TERRAIN_USE_FLAT_FACES = false;
const TERRAIN_FLAT_BLOCK_KEYS = [];
const TERRAIN_TEXTURED_CUBES = true;
const TERRAIN_CUBE_FULL_FACES = true;
const LEGO_BRICK_STEP = 32;
```

Blocs depuis `assets/tiles/blocks/*.png`, empilement 3 niveaux OK.

## Mode hybride — Comfy par bloc (recommandé pour tester)

```javascript
const TERRAIN_USE_FLAT_FACES = false;
const TERRAIN_FLAT_BLOCK_KEYS = ['stone'];
```

1. Charge d'abord les PNG nature (repli si flat manquant)
2. Attend le gabarit dirt/grass puis remplace `stone` par Comfy
3. **Recadre** le bake Comfy sur les dimensions exactes du PNG nature (empilement identique)

Workflow Comfy :

```bash
python tools/comfy_terrain_batch.py --only stone
python tools/import_flat_textures.py --force
```

Puis Ctrl+F5 + nouvelle partie.

## Mode full flat (expérimental)

```javascript
const TERRAIN_USE_FLAT_FACES = true;
const TERRAIN_FLAT_BLOCK_KEYS = [];
```

Toutes les faces depuis `flat/game/`. Nécessite les 6 faces importées, sinon rendu plat cassé.

## Retour arrière rapide

Mettre `TERRAIN_FLAT_BLOCK_KEYS = []` et Ctrl+F5.
