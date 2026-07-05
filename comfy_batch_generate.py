"""
Pipeline d'automatisation pour générer TOUS les assets visuels du jeu Olympos.
Supporte deux modes : Illustrious (SDXL) + LoRA chibi, ou Flux + LoRA villa méditerranéenne.

Ce script génère en un seul batch :
  - les batiments (production, stockage, services, commerce, militaire, admin)
  - les decorations (statue, garden, colonnade)
  - les niveaux de maison (hut, house, decent, villa, residence, palais)
  - les cases de terrain (grass, wheat, marble, water)

Deux modes de génération par asset, choisis automatiquement :
  - img2img  : si un fichier guide existe (denoise modéré, garde la silhouette)
  - txt2img  : sinon, génération complète depuis le prompt seul (denoise 1.0)

Textures manquantes du jeu (carrotFarm, huntingPavilion, etc.) :
  python comfy_batch_generate.py --list-missing-all   # audit complet
  python comfy_batch_generate.py --gaps-only          # génère seulement ce qui manque
  python import_comfy_raw.py --deploy                 # sprites_out -> assets/

Pensé pour tourner en arrière-plan sans surveillance :
  - SKIP_EXISTING : les assets déjà produits sont ignorés -> on peut relancer
    le script pour reprendre là où il s'est arrêté
  - chaque asset est isolé dans un try/except + retries : un échec n'interrompt
    pas le reste du batch, un récapitulatif est affiché à la fin

Étapes pour chaque asset :
  1. (img2img seulement) Upload de l'image guide vers ComfyUI
  2. Lancement du workflow (img2img ou txt2img)
  3. Récupération de l'image générée
  4. Post-traitement selon la catégorie :
       - batiments/maisons : détourage du fond blanc -> transparence
       - terrains          : masque losange isométrique (tuile prête à l'emploi)
  5. Redimensionnement et sauvegarde dans sprites_out/<categorie>/

Prérequis : pip install requests pillow --break-system-packages

A CONFIGURER avant de lancer (voir section CONFIG ci-dessous) :
  - Le modèle est choisi PAR CATEGORIE (voir CATEGORY_RENDER) :
      batiments + maisons -> Flux ; terrains -> Illustrious + LoRA dédié
  - COMFY_URL    : http://127.0.0.1:8188 en local, ou l'URL/port de ton pod RunPod
  - Les noms de checkpoints / LoRA / VAE doivent correspondre à tes fichiers ComfyUI

IMPORTANT - negative prompt et Flux :
  En mode Flux, le cfg du KSampler est fixé à 1.0 (obligatoire pour ce modèle), ce qui
  neutralise MATHÉMATIQUEMENT le negative prompt (résultat = positif uniquement à cfg=1.0).
  Toutes les contraintes "no base, no terrain, isolated..." sont donc inutiles côté Flux
  si elles ne sont QUE dans le negative prompt -> voir ISOLATION_CLAUSE plus bas, qui les
  réinjecte dans le prompt POSITIF pour les bâtiments/maisons en mode Flux.
"""

import argparse
import io
import json
import math
import random
import time
import os
import requests
from PIL import Image, ImageDraw, ImageFilter

# ===================== CONFIG GENERALE =====================
# Le modèle (Flux ou Illustrious) est choisi PAR CATEGORIE d'asset, pas globalement :
#   - batiments + maisons -> Flux + LoRA villa méditerranéenne
#   - terrains            -> Illustrious + LoRA dédié aux textures de sol
# Voir CATEGORY_RENDER plus bas pour le détail.
DEFAULT_MODE = "FLUX"           # repli si une catégorie n'est pas listée
BUILDINGS_MODE = "FLUX"         # utilisé pour "buildings" et "houses"
TILES_MODE = "ILLUSTRIOUS"      # modèle IA si TILE_MODE == "AI" (déconseillé pour le sol)

# Les cases de terrain sont des textures de sol simples : l'IA (surtout un modèle
# illustration + LoRA décoratif) produit des motifs bizarres. Le mode procédural
# (bruit + teinte via PIL) donne des tuiles propres, tileables et instantanées,
# sans GPU. Mettre "AI" pour repasser par ComfyUI (non recommandé pour le sol).
TILE_MODE = "PROCEDURAL"        # "PROCEDURAL" (recommandé) ou "AI"
COMFY_URL = "http://127.0.0.1:8188"   # <-- adapte selon ton setup (local ou RunPod)
GEN_SIZE = 512
FINAL_SIZE = 144
WHITE_THRESHOLD = 235
STEPS = 30
DENOISE = 0.8            # denoise par défaut en img2img (ignoré en txt2img)

# Robustesse pour exécution en arrière-plan
SKIP_EXISTING = True     # ignore un asset si son fichier de sortie existe déjà
RETRIES = 1              # nombre de nouvelles tentatives par asset en cas d'échec

# ----- Raffinement depuis les images déjà générées -----
# Si True : pour "buildings"/"houses", utilise sprites_out/<cat>/<output> (s'il existe déjà)
# comme NOUVEAU guide img2img, à la place du guide géométrique d'origine. Pratique pour
# corriger un défaut récurrent (ex: socle/décor parasite) sur des images déjà satisfaisantes
# par ailleurs, sans tout régénérer depuis zéro.
# ATTENTION : met SKIP_EXISTING = False quand REFINE_FROM_EXISTING = True, sinon le script
# ignore ces fichiers parce qu'ils "existent déjà" -> rien ne sera raffiné.
# Ici on veut GÉNÉRER LES NOUVEAUX et IGNORER L'EXISTANT -> raffinement désactivé.
REFINE_FROM_EXISTING = False
REFINE_DENOISE = 0.6     # plus bas que DENOISE (0.8) : on garde déjà une bonne base, on corrige
                          # juste le socle/décor (changement structurel, donc pas trop bas non plus)

# Dimensions d'une tuile isométrique dans le jeu (cf. config.js : TILE_W / TILE_H).
# On génère les terrains à 2x pour rester net après mise à l'échelle.
TILE_W = 64
TILE_H = 32
TILE_SCALE = 2

# ===================== CONFIG MODE ILLUSTRIOUS (SDXL) =====================
CHECKPOINT = "illustriousXL_v01.safetensors"     # <-- ton checkpoint Illustrious réel
LORA_NAME = "cartoon_isometric_fantasy.safetensors"  # <-- LoRA par défaut (non utilisé actuellement)
# LoRA dédié aux cases de terrain (mode Illustrious).
TILE_LORA_NAME = "905108SBRC4DM4PJF0B2CWVYH0.safetensors"
LORA_STRENGTH = 0.6
CFG = 7.0

# ===================== CONFIG MODE FLUX =====================
# Sur 6 Go de VRAM, le Flux complet (fp16 ~23Go, fp8 ~12Go) est trop lourd.
# On utilise une version quantifiée GGUF (~6-7Go) à la place.
# Prérequis : installer le custom node "ComfyUI-GGUF" via le Manager.
FLUX_USE_GGUF = True
FLUX_MODEL = "flux1-dev-Q4_K_S.gguf"             # <-- nom exact du fichier GGUF téléchargé
FLUX_CLIP_T5 = "t5xxl_fp8_e4m3fn.safetensors"    # version fp8 du T5, plus légère
FLUX_CLIP_L = "clip_l.safetensors"
FLUX_VAE = "ae.safetensors"
FLUX_LORA_NAME = "1751268368.safetensors"  # <-- nom exact du LoRA trouvé
FLUX_LORA_STRENGTH = 0.8
FLUX_GUIDANCE = 3.5   # équivalent du CFG pour Flux (le cfg du KSampler reste à 1.0)

# Mots-clés déclencheurs : adaptés selon le mode actif, puisque les deux LoRA visent
# des styles différents (chibi/diorama pour Illustrious, villa réaliste-stylisée pour Flux).
# Vérifie sur la page Civitai de chaque LoRA s'il demande des mots-clés spécifiques.
STYLE_TRIGGER_BY_MODE = {
    "ILLUSTRIOUS": "diorama, miniature, isometric, chibi, cute, from above",
    "FLUX": "isometric building, stylized realistic, mediterranean architecture, from above",
}
# Batiments et maisons -> on prend le style du mode des batiments.
STYLE_TRIGGER = STYLE_TRIGGER_BY_MODE.get(BUILDINGS_MODE, "")

# Style dédié aux cases de terrain : texture vue de dessus, pas un objet/bâtiment.
TILE_STYLE_BY_MODE = {
    "ILLUSTRIOUS": "top down view, seamless tileable game texture, hand painted, flat lighting",
    "FLUX": "top down orthographic seamless tileable texture, stylized realistic, flat even lighting",
}
# Terrains -> on prend le style du mode des terrains.
TILE_STYLE = TILE_STYLE_BY_MODE.get(TILES_MODE, "")

# Négatif pour objets isolés (batiments, maisons) : pas de base de terrain, pas de personnage.
# RAPPEL : sans effet en mode Flux (cfg=1.0) -> voir ISOLATION_CLAUSE ci-dessous, qui porte
# réellement ces contraintes en mode Flux. Ce negative reste utile en mode Illustrious.
NEGATIVE_PROMPT = (
    "blurry, photo, photorealistic, text, watermark, "
    "logo, signature, gradient background, cropped, "
    "floating island, terrain base, grass base, multiple buildings, scenery, full diorama scene, "
    "person, human, human figure, character, villager, mascot, npc, face, "
    "onion dome, finial, knob on roof, decorative spire, minaret"
)

# Négatif pour les terrains : surtout pas de bâtiment ni d'objet, juste du sol.
NEGATIVE_PROMPT_TILE = (
    "blurry, photo, text, watermark, logo, signature, "
    "building, house, structure, wall, roof, object, person, human, character, "
    "isometric building, border, frame, vignette, perspective, 3d object"
)

# Clause d'isolement portée dans le prompt POSITIF pour les bâtiments/maisons en mode Flux.
# Nécessaire car le negative prompt n'a aucun effet réel en Flux (cfg=1.0) -> c'est la seule
# façon fiable de faire respecter "pas de socle, pas de décor" par ce modèle.
ISOLATION_CLAUSE = (
    "single isolated object floating on pure white background, "
    "no base, no platform, no ground, no plaza, no courtyard, no pedestal, "
    "no statues, no debris, no plants, no bushes, no trees, no surrounding scenery, "
    "nothing else in frame"
)

# Decorations : clause d'isolement plus souple (statue sur petit socle, jardin compact…).
DECORATION_ISOLATION_CLAUSE = (
    "single isolated decorative object on pure white background, "
    "compact footprint, no surrounding scenery, nothing else in frame"
)

# Réglages par défaut selon la catégorie d'asset.
#   remove_bg : détoure le fond blanc en transparence (objets isolés)
#   iso_tile  : applique un masque losange iso et sort une tuile prête à poser
#   final_size: côté max de l'image finale (ignoré pour iso_tile qui sort en TILE_W*scale)
#   negative  : prompt négatif utilisé
CATEGORY_DEFAULTS = {
    "buildings": {"remove_bg": True,  "iso_tile": False, "final_size": FINAL_SIZE, "negative": NEGATIVE_PROMPT},
    "houses":    {"remove_bg": True,  "iso_tile": False, "final_size": FINAL_SIZE, "negative": NEGATIVE_PROMPT},
    "tiles":     {"remove_bg": False, "iso_tile": True,  "final_size": FINAL_SIZE, "negative": NEGATIVE_PROMPT_TILE},
}

# Modèle et LoRA utilisés par catégorie. "mode" sélectionne le workflow (FLUX / ILLUSTRIOUS).
# "lora_name" (optionnel, mode Illustrious) surcharge le LoRA par défaut LORA_NAME.
CATEGORY_RENDER = {
    "buildings": {"mode": BUILDINGS_MODE},
    "houses":    {"mode": BUILDINGS_MODE},
    "tiles":     {"mode": TILES_MODE, "lora_name": TILE_LORA_NAME},
}

# ===================== LISTE DES ASSETS A GENERER =====================
# Chaque entrée :
#   category : "buildings" | "houses" | "tiles" (détermine le post-traitement)
#   output   : nom du fichier de sortie (dans sprites_out/<category>/)
#   prompt   : prompt positif
#   guide    : (optionnel) nom du fichier guide -> active l'img2img s'il existe
#   denoise  : (optionnel, img2img) surcharge le denoise par défaut
#   refine_denoise : (optionnel) denoise spécifique utilisé UNIQUEMENT quand
#                    REFINE_FROM_EXISTING=True (sinon REFINE_DENOISE global)
# Place les guides (guide_farm.png, guide_granary.png, ...) dans le MÊME dossier
# que ce script. Tout asset sans guide est généré en txt2img (depuis le prompt seul).
ASSETS = [
    # ---------- BATIMENTS ----------
    {
        "category": "buildings",
        "guide": "guide_farm.png",
        "output": "farm.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek farmhouse, no base, no terrain, "
                  "weathered limestone walls, reddish terracotta clay roof tiles, "
                  "isometric game asset, isolated on plain white background",
        # pas de "denoise" ici -> utilise la valeur globale DENOISE (0.8, ça marche bien sur ce toit)
    },
    {
        "category": "buildings",
        "guide": "guide_granary.png",
        "output": "granary.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek granary, no base, no terrain, "
                  "simple smooth hemispherical dome roof, plain dome with no decoration, "
                  "sandstone walls, isometric game asset, isolated on plain white background",
        "denoise": 0.65,  # plus bas que la ferme : le dôme dérive trop à denoise élevé
        "refine_denoise": 0.5,  # pareil en raffinement : rester prudent sur la forme du dôme
    },
    {
        "category": "buildings",
        "output": "quarry.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek marble quarry, stone cutting pit, "
                  "cut blocks of white marble, wooden lifting scaffolding, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "workshop.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek sculptor workshop, small stone building, "
                  "marble statue being carved at the entrance, chisels and stone dust, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "guide": "guide_fountain.png",
        "output": "fountain.png",
        "denoise": 0.72,
        "prompt": f"{STYLE_TRIGGER}, small ancient greek courtyard fountain, circular white marble basin, "
                  "clear blue water, central water jet, no building, no temple, no roof, no columns, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "market.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek agora market stall, wooden trading stand, "
                  "striped cloth awning, baskets of fruit and amphorae, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },

    # ---------- NOUVEAUX BATIMENTS (chaines de prod / services / stockage) ----------
    {
        "category": "buildings",
        "output": "oliveGrove.png",
        "prompt": f"{STYLE_TRIGGER}, single small ancient greek olive grove, a few olive trees with silvery green leaves, "
                  "low dry stone wall, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "vineyard.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek vineyard, rows of grape vines on wooden trellises, "
                  "ripe grapes, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "sheepFarm.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek sheep farm, small wooden fenced pen with a few white woolly sheep, "
                  "hay bales, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "oilPress.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek olive oil press building, round stone mill wheel, "
                  "clay amphorae of oil, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "winery.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek winery, stone wine pressing vat, wooden barrels and amphorae, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "warehouse.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek storage warehouse, stone walls, large wooden double doors, "
                  "stacked wooden crates and amphorae, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "temple.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek temple, white marble columns, triangular pediment, "
                  "red terracotta tiled roof, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "clinic.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek healing house asklepieion, small stone infirmary with columns, "
                  "hanging medicinal herbs, no base, no terrain, isometric game asset, isolated on plain white background",
    },

    # ---------- COMMERCE / MILITAIRE / ADMIN (sans texture dans le jeu) ----------
    {
        "category": "buildings",
        "output": "tradingPost.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek trading post comptoir, stone building with wooden scales and balance, "
                  "stacked amphorae and trade goods, merchant counter, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "heroTemple.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek hero temple, small stone shrine with bronze shields and spears on walls, "
                  "altar with laurel wreath, heroic monument, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "barracks.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek military barracks, stone building with wooden training yard gate, "
                  "stacked shields spears and helmets, soldier equipment racks, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "harbor.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek harbor port on land, stone pier and wooden dock, "
                  "moored amphorae and rope coils, small stone warehouse shed, Mediterranean coast, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "shipyard.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek shipyard, wooden trireme hull under construction on slipway, "
                  "scaffolding, ropes, bronze fittings, stone tools shed, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "taxOffice.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek tax office, small administrative stone building, "
                  "wooden desk with clay tablets and coin chest, abacus, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "watchtower.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek fire watch tower, tall stone lookout tower with wooden platform, "
                  "brazier on top, ladder, no base, no terrain, isometric game asset, isolated on plain white background",
    },

    # ---------- CHAINES DE PRODUCTION (textures parfois déployées à la main, absentes du batch d'origine) ----------
    {
        "category": "buildings",
        "output": "fishery.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek fishery, wooden pier with fishing nets drying, "
                  "baskets of fish and clay amphorae, small stone shed, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "weaver.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek weaver workshop, stone building with loom and spinning wheel, "
                  "rolls of wool and dyed fabric, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "foundry.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek bronze foundry, stone furnace with glowing embers, "
                  "anvil, ingots and crucible, smoke hood, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "armory.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek armory weapons depot, stone building with racks of bronze shields, "
                  "spears helmets and swords, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "charcoalPit.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek charcoal pit in forest, circular stone kiln mound with wood stacks, "
                  "smoldering charcoal, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "carrotFarm.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek vegetable garden farm plot, rows of orange carrots and green tops, "
                  "low irrigation ditch, wooden hoe, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "huntingPavilion.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek hunting pavilion lodge, rustic stone and timber shelter in woods, "
                  "antlers and hunting bows on wall, game rack, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },

    # ---------- DECORATIONS (cachet / beaute) — flag decoration=True pour prompt adapté ----------
    {
        "category": "buildings",
        "decoration": True,
        "output": "statue.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek marble statue on small stone pedestal, "
                  "classical hero figure, decorative monument, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "decoration": True,
        "output": "garden.png",
        "prompt": f"{STYLE_TRIGGER}, single small ancient greek ornamental garden, trimmed bushes and flowers in stone planter, "
                  "small cypress tree, decorative plants, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "decoration": True,
        "output": "colonnade.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek colonnade, row of white marble columns with lintel, "
                  "decorative architectural pergola, isometric game asset, isolated on plain white background",
    },

    {
        "category": "buildings",
        "output": "grandTemple.png",
        "final_size": 256,
        "prompt": f"{STYLE_TRIGGER}, single massive ancient greek grand temple monument, enormous white marble columns, "
                  "golden pediment, wide monumental staircase, grand sacred shrine, impressive scale, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },

    # ---------- NIVEAUX DE MAISON ----------
    {
        "category": "houses",
        "output": "hut.png",
        "prompt": f"{STYLE_TRIGGER}, single small humble ancient greek hut, mud brick walls, "
                  "simple thatched straw roof, very modest poor dwelling, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "house.png",
        "prompt": f"{STYLE_TRIGGER}, single modest ancient greek house, whitewashed plaster walls, "
                  "terracotta tiled roof, small wooden door, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "decent.png",
        "prompt": f"{STYLE_TRIGGER}, single comfortable ancient greek townhouse, two storeys, "
                  "painted plaster walls, terracotta tiled roof, small shuttered windows, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "villa.png",
        "prompt": f"{STYLE_TRIGGER}, single luxurious ancient greek villa, white marble columns, "
                  "large tiled roof, inner courtyard, ornate wealthy mansion, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "domaine.png",
        "prompt": f"{STYLE_TRIGGER}, single wealthy ancient greek country estate domain, large rural mansion with courtyard, "
                  "olive trees nearby, terracotta tiled roof, painted stone walls, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "residence.png",
        "prompt": f"{STYLE_TRIGGER}, single elegant ancient greek residence, two storey stone house with balcony, "
                  "terracotta tiled roof, decorative painted trim, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "houses",
        "output": "palais.png",
        "prompt": f"{STYLE_TRIGGER}, single grand ancient greek palace mansion, many white marble columns, "
                  "multiple wings, ornate large tiled roof, luxurious estate, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },

    # ---------- CASES DE TERRAIN ----------
    {
        "category": "tiles",
        "output": "grass.png",
        "prompt": f"{TILE_STYLE}, lush green grass meadow ground, short grass, "
                  "natural soil, no objects",
    },
    {
        "category": "tiles",
        "output": "wheat.png",
        "prompt": f"{TILE_STYLE}, golden ripe wheat field, rows of cereal crops, "
                  "farmland ground, no objects",
    },
    {
        "category": "tiles",
        "output": "marble.png",
        "prompt": f"{TILE_STYLE}, rocky white grey marble stone ground, cracked rock terrain, "
                  "quarry ground, no objects",
    },
    {
        "category": "tiles",
        "output": "water.png",
        "prompt": f"{TILE_STYLE}, calm blue mediterranean sea water, gentle ripples and reflections, "
                  "shallow water surface, no objects",
    },
    {
        "category": "tiles",
        "output": "sand.png",
        "prompt": f"{TILE_STYLE}, mediterranean sandy beach ground, fine golden sand grains, "
                  "coastal shore terrain, no objects",
    },
    {
        "category": "tiles",
        "output": "forest.png",
        "prompt": f"{TILE_STYLE}, mediterranean forest floor, grass with small trees and bushes, "
                  "olive and pine undergrowth, no objects",
    },
    {
        "category": "tiles",
        "output": "rock.png",
        "prompt": f"{TILE_STYLE}, steep rocky cliff ground, grey limestone crags and boulders, "
                  "mountain slope terrain, no objects",
    },
    {
        "category": "tiles",
        "output": "hill.png",
        "prompt": f"{TILE_STYLE}, rolling green hill pasture, gentle slope meadow grass, "
                  "mediterranean countryside, no objects",
    },
]

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "sprites_out")
GAME_ASSET_DIRS = {
    "buildings": os.path.join(SCRIPT_DIR, "assets", "buildings"),
    "houses": os.path.join(SCRIPT_DIR, "assets", "houses"),
    "tiles": os.path.join(SCRIPT_DIR, "assets", "tiles"),
}

# ===================== PHASE 1 — CULTURE (nouveaux batiments) =====================
# Générer uniquement ce lot : python comfy_batch_generate.py --phase1-culture
# Relance sans regénérer l'existant (sprites_out + assets/buildings).
PHASE1_CULTURE_ASSETS = [
    {
        "category": "buildings",
        "output": "agora.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek civic agora, open stone plaza with wide steps, "
                  "surrounding marble columns and stoas, public assembly square, no market stall, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "theatre.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek theatre, semicircular stone amphitheatre, "
                  "tiered seating rows, small stage orchestra, no actors, no base, no terrain, "
                  "isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "gymnasium.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek gymnasium palestra, rectangular courtyard with "
                  "sand training ground, colonnade on one side, running track, no athletes, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "stoa.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek civic stoa building, compact square footprint, "
                  "short covered portico with white marble columns and tiled roof, "
                  "no long horizontal extension, no base, no terrain, isometric game asset, isolated on plain white background",
    },
    {
        "category": "buildings",
        "output": "academy.png",
        "prompt": f"{STYLE_TRIGGER}, single ancient greek academy school, modest stone lecture hall, "
                  "scrolls and lyre relief, small columned entrance, philosophers school, "
                  "no base, no terrain, isometric game asset, isolated on plain white background",
    },
]


ASSETS.extend(PHASE1_CULTURE_ASSETS)

# Textures encore absentes ou réutilisées dans config.js (carrotFarm, huntingPavilion, domaine…).
# Générer uniquement celles qui manquent : python comfy_batch_generate.py --gaps-only
GAPS_ASSETS = [
    e for e in ASSETS
    if e["output"] in {
        "fishery.png", "weaver.png", "foundry.png", "armory.png", "charcoalPit.png",
        "carrotFarm.png", "huntingPavilion.png", "domaine.png",
    }
]


def sprite_exists(entry, check_sprites_out=True, check_game=True):
    """True si le PNG existe déjà dans sprites_out et/ou assets/."""
    if check_sprites_out:
        out = os.path.join(OUTPUT_DIR, entry["category"], entry["output"])
        if os.path.isfile(out):
            return True
    if check_game:
        game = os.path.join(GAME_ASSET_DIRS.get(entry["category"], ""), entry["output"])
        if game and os.path.isfile(game):
            return True
    return False


def filter_missing_assets(entries, check_game=True):
    missing = [e for e in entries if not sprite_exists(e, check_game=check_game)]
    present = len(entries) - len(missing)
    return missing, present


# ===================== COMFYUI API =====================
def upload_image(filepath):
    """Envoie une image vers ComfyUI et renvoie son nom de fichier côté serveur."""
    with open(filepath, "rb") as f:
        files = {"image": (os.path.basename(filepath), f, "image/png")}
        resp = requests.post(f"{COMFY_URL}/upload/image", files=files)
    resp.raise_for_status()
    return resp.json()["name"]


def build_workflow_illustrious(prompt_text, seed, denoise, negative,
                               image_filename=None, width=GEN_SIZE, height=GEN_SIZE,
                               lora_name=None):
    """Construit le graphe de nodes ComfyUI pour Illustrious (SDXL) + LoRA.

    Si image_filename est fourni -> img2img (LoadImage + VAEEncode).
    Sinon -> txt2img (EmptyLatentImage, denoise forcé à 1.0).
    lora_name permet de surcharger le LoRA (sinon LORA_NAME par défaut).
    """
    lora_name = lora_name or LORA_NAME
    workflow = {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "5": {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": lora_name,
                "strength_model": LORA_STRENGTH,
                "strength_clip": LORA_STRENGTH,
                "model": ["4", 0],
                "clip": ["4", 1],
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt_text, "clip": ["5", 1]},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative, "clip": ["5", 1]},
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": STEPS,
                "cfg": CFG,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": denoise,
                "model": ["5", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": None,  # rempli juste après selon le mode
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": "olympos_asset"},
        },
    }

    if image_filename:
        workflow["10"] = {"class_type": "LoadImage", "inputs": {"image": image_filename}}
        workflow["12"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["4", 2]}}
        workflow["3"]["inputs"]["latent_image"] = ["12", 0]
    else:
        workflow["13"] = {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        }
        workflow["3"]["inputs"]["latent_image"] = ["13", 0]
        workflow["3"]["inputs"]["denoise"] = 1.0

    return workflow


def build_workflow_flux(prompt_text, seed, denoise, negative,
                        image_filename=None, width=GEN_SIZE, height=GEN_SIZE):
    """Construit le graphe de nodes ComfyUI pour Flux + LoRA (UNet-only).

    Si image_filename est fourni -> img2img (LoadImage + VAEEncode).
    Sinon -> txt2img (EmptySD3LatentImage, denoise forcé à 1.0).
    """
    unet_loader_type = "UnetLoaderGGUF" if FLUX_USE_GGUF else "UNETLoader"
    unet_inputs = (
        {"unet_name": FLUX_MODEL}
        if FLUX_USE_GGUF
        else {"unet_name": FLUX_MODEL, "weight_dtype": "default"}
    )
    workflow = {
        "20": {
            "class_type": unet_loader_type,
            "inputs": unet_inputs,
        },
        "21": {
            "class_type": "DualCLIPLoader",
            "inputs": {
                "clip_name1": FLUX_CLIP_T5,
                "clip_name2": FLUX_CLIP_L,
                "type": "flux",
            },
        },
        "22": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": FLUX_VAE},
        },
        "23": {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "lora_name": FLUX_LORA_NAME,
                "strength_model": FLUX_LORA_STRENGTH,
                "model": ["20", 0],
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt_text, "clip": ["21", 0]},
        },
        "24": {
            "class_type": "FluxGuidance",
            "inputs": {"guidance": FLUX_GUIDANCE, "conditioning": ["6", 0]},
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": STEPS,
                "cfg": 1.0,           # le vrai "guidance" passe par le node FluxGuidance ci-dessus
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": denoise,
                "model": ["23", 0],
                "positive": ["24", 0],
                "negative": ["24", 0],  # sans effet réel à cfg=1.0, juste pour satisfaire le node
                "latent_image": None,   # rempli juste après selon le mode
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["22", 0]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": "olympos_asset"},
        },
    }

    if image_filename:
        workflow["10"] = {"class_type": "LoadImage", "inputs": {"image": image_filename}}
        workflow["12"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["10", 0], "vae": ["22", 0]}}
        workflow["3"]["inputs"]["latent_image"] = ["12", 0]
    else:
        # EmptySD3LatentImage est le node latent recommandé pour Flux/SD3 (core ComfyUI).
        workflow["13"] = {
            "class_type": "EmptySD3LatentImage",
            "inputs": {"width": width, "height": height, "batch_size": 1},
        }
        workflow["3"]["inputs"]["latent_image"] = ["13", 0]
        workflow["3"]["inputs"]["denoise"] = 1.0

    return workflow


def queue_prompt(workflow):
    resp = requests.post(f"{COMFY_URL}/prompt", json={"prompt": workflow})
    if resp.status_code != 200:
        print("---- Détail de l'erreur renvoyée par ComfyUI ----")
        print(resp.text)
        print("--------------------------------------------------")
    resp.raise_for_status()
    return resp.json()["prompt_id"]


def wait_for_result(prompt_id, timeout=900, poll_every=3):
    start = time.time()
    last_log = -30
    while time.time() - start < timeout:
        resp = requests.get(f"{COMFY_URL}/history/{prompt_id}")
        data = resp.json()
        if prompt_id in data:
            entry = data[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"ComfyUI a signalé une erreur d'exécution : {status}")
            return entry
        elapsed = int(time.time() - start)
        if elapsed - last_log >= 30:
            print(f"   ...toujours en attente ({elapsed}s écoulées, timeout à {timeout}s)")
            last_log = elapsed
        time.sleep(poll_every)
    raise TimeoutError(f"Génération trop longue (>{timeout}s) pour {prompt_id}")


def fetch_image_bytes(filename, subfolder, folder_type):
    resp = requests.get(
        f"{COMFY_URL}/view",
        params={"filename": filename, "subfolder": subfolder, "type": folder_type},
    )
    resp.raise_for_status()
    return resp.content


# ===================== POST-TRAITEMENT =====================
def remove_white_background(img, threshold=WHITE_THRESHOLD):
    """Chroma-key simple : tout pixel proche du blanc devient transparent."""
    img = img.convert("RGBA")
    pixels = img.getdata()
    new_pixels = []
    for r, g, b, a in pixels:
        if r > threshold and g > threshold and b > threshold:
            new_pixels.append((r, g, b, 0))
        else:
            new_pixels.append((r, g, b, a))
    img.putdata(new_pixels)
    return img


def make_iso_tile(img, w, h):
    """Découpe une texture carrée en losange isométrique (tuile prête à poser).

    La texture est étirée vers le ratio 2:1 de la grille puis masquée par un
    losange (sommets : haut, droite, bas, gauche). Le reste devient transparent.
    """
    tex = img.convert("RGBA").resize((w, h), Image.LANCZOS)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.polygon(
        [(w / 2, 0), (w, h / 2), (w / 2, h), (0, h / 2)],
        fill=255,
    )
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.paste(tex, (0, 0), mask)
    return out


# ===================== TERRAINS PROCEDURAUX (PIL, sans GPU) =====================
# L'IA est mauvaise pour les textures de sol vues de dessus ; on les génère ici
# avec du bruit + des teintes. Chaque fonction renvoie une image carrée RGB qui
# sera ensuite découpée en losange isométrique par make_iso_tile.
def _noise_base(size, base_rgb, variation, seed, blur=1.5):
    rnd = random.Random(seed)
    img = Image.new("RGB", (size, size))
    px = img.load()
    r0, g0, b0 = base_rgb
    for y in range(size):
        for x in range(size):
            j = rnd.randint(-variation, variation)
            px[x, y] = (
                max(0, min(255, r0 + j)),
                max(0, min(255, g0 + j)),
                max(0, min(255, b0 + j)),
            )
    return img.filter(ImageFilter.GaussianBlur(blur)) if blur > 0 else img


def texture_grass(size, seed):
    img = _noise_base(size, (104, 150, 68), 26, seed, blur=1.4)
    rnd = random.Random(seed + 1)
    d = ImageDraw.Draw(img)
    for _ in range(size * size // 700):  # touffes plus claires / plus foncées
        x, y = rnd.randint(0, size), rnd.randint(0, size)
        shade = rnd.choice([(86, 128, 54), (124, 170, 84)])
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=shade)
    return img.filter(ImageFilter.GaussianBlur(0.6))


def texture_wheat(size, seed):
    img = _noise_base(size, (198, 162, 72), 20, seed, blur=1.0)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed + 2)
    for x in range(0, size, 3):  # stries verticales façon épis
        s = rnd.randint(-18, 18)
        d.line([(x, 0), (x, size)],
               fill=(max(0, min(255, 208 + s)), max(0, min(255, 172 + s)), max(0, min(255, 84 + s))),
               width=1)
    return img.filter(ImageFilter.GaussianBlur(0.9))


def texture_marble(size, seed):
    img = _noise_base(size, (202, 200, 192), 14, seed, blur=2.0)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed + 3)
    for _ in range(6):  # veines grises
        x, y = rnd.randint(0, size), rnd.randint(0, size)
        pts = [(x, y)]
        for _ in range(8):
            x += rnd.randint(-size // 6, size // 6)
            y += rnd.randint(-size // 6, size // 6)
            pts.append((x, y))
        d.line(pts, fill=(150, 148, 142), width=1)
    return img.filter(ImageFilter.GaussianBlur(0.7))


def texture_water(size, seed):
    rnd = random.Random(seed + 4)
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            ripple = int(12 * math.sin(x * 0.08 + y * 0.04) + 8 * math.sin(y * 0.15))
            j = rnd.randint(-6, 6)
            px[x, y] = (
                max(0, min(255, 46 + ripple // 2 + j)),
                max(0, min(255, 110 + ripple + j)),
                max(0, min(255, 150 + ripple + j)),
            )
    return img.filter(ImageFilter.GaussianBlur(1.2))


def texture_sand(size, seed):
    img = _noise_base(size, (210, 190, 140), 22, seed, blur=1.2)
    rnd = random.Random(seed + 5)
    d = ImageDraw.Draw(img)
    for _ in range(size * size // 500):
        x, y = rnd.randint(0, size), rnd.randint(0, size)
        d.point((x, y), fill=(rnd.randint(220, 240), rnd.randint(200, 220), rnd.randint(150, 170)))
    return img.filter(ImageFilter.GaussianBlur(0.8))


def texture_forest(size, seed):
    img = _noise_base(size, (72, 110, 52), 24, seed, blur=1.0)
    rnd = random.Random(seed + 6)
    d = ImageDraw.Draw(img)
    for _ in range(size // 8):
        x, y = rnd.randint(4, size - 4), rnd.randint(4, size - 4)
        d.ellipse([x - 3, y - 5, x + 3, y + 1], fill=(45, 75, 38))
        d.ellipse([x - 5, y - 8, x + 5, y - 2], fill=(55, 95, 42))
    return img.filter(ImageFilter.GaussianBlur(0.7))


def texture_rock(size, seed):
    img = _noise_base(size, (130, 128, 122), 18, seed, blur=1.5)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed + 7)
    for _ in range(10):
        x, y = rnd.randint(0, size), rnd.randint(0, size)
        pts = [(x, y)]
        for _ in range(5):
            x += rnd.randint(-8, 8)
            y += rnd.randint(-8, 8)
            pts.append((x, y))
        d.line(pts, fill=(95, 92, 88), width=2)
    return img.filter(ImageFilter.GaussianBlur(0.5))


def texture_hill(size, seed):
    img = _noise_base(size, (118, 155, 72), 20, seed, blur=1.3)
    rnd = random.Random(seed + 8)
    d = ImageDraw.Draw(img)
    for _ in range(8):
        x = rnd.randint(0, size)
        d.arc([x - 20, size // 3, x + 20, size], 180, 360, fill=(100, 140, 65), width=2)
    return img.filter(ImageFilter.GaussianBlur(0.9))


TILE_TEXTURES = {
    "grass.png": texture_grass,
    "wheat.png": texture_wheat,
    "marble.png": texture_marble,
    "water.png": texture_water,
    "sand.png": texture_sand,
    "forest.png": texture_forest,
    "rock.png": texture_rock,
    "hill.png": texture_hill,
}


def generate_tile_procedural(entry):
    fn = TILE_TEXTURES.get(entry["output"])
    if fn is None:
        raise RuntimeError(f"Pas de générateur procédural pour {entry['output']}")
    print(f"-> Génération procédurale (PIL) de la tuile {entry['output']}...")
    seed = abs(hash(entry["output"])) % (2 ** 31)
    tex = fn(256, seed)
    tile = make_iso_tile(tex, TILE_W * TILE_SCALE, TILE_H * TILE_SCALE)
    out_dir = os.path.join(OUTPUT_DIR, entry["category"])
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, entry["output"])
    tile.save(output_path)
    print(f"-> Tuile finalisée : {output_path}\n")


def save_image_safe(img, output_path):
    """Sauvegarde avec message explicite si Windows bloque l'écriture (fichier ouvert, OneDrive…)."""
    try:
        img.save(output_path)
    except (PermissionError, OSError) as exc:
        if getattr(exc, "winerror", None) != 5 and not isinstance(exc, PermissionError):
            raise
        raise PermissionError(
            f"Impossible d'écrire {output_path} — fermez l'aperçu Windows / Paint / Photoshop "
            f"si le fichier est ouvert, ou vérifiez que OneDrive n'est pas en train de synchroniser "
            f"le dossier sprites_out. Détail : {exc}"
        ) from exc


def finalize_asset(raw_bytes, output_path, remove_bg=True, iso_tile=False, final_size=FINAL_SIZE):
    img = Image.open(io.BytesIO(raw_bytes))
    if iso_tile:
        img = make_iso_tile(img, TILE_W * TILE_SCALE, TILE_H * TILE_SCALE)
    elif remove_bg:
        img = remove_white_background(img)
        img.thumbnail((final_size, final_size), Image.LANCZOS)
    else:
        img = img.convert("RGBA")
        img.thumbnail((final_size, final_size), Image.LANCZOS)
    save_image_safe(img, output_path)


# ===================== PIPELINE PRINCIPAL =====================
def generate_asset(entry):
    category = entry["category"]
    defaults = CATEGORY_DEFAULTS[category]
    render = CATEGORY_RENDER.get(category, {"mode": DEFAULT_MODE})
    mode = render["mode"]
    negative = entry.get("negative", defaults["negative"])

    # Clause d'isolement : en Flux (cfg=1.0), le negative prompt n'a AUCUN effet sur le
    # résultat. Pour les bâtiments/maisons isolés, on porte donc ces contraintes dans le
    # prompt POSITIF, seule chose que Flux respecte vraiment.
    prompt_text = entry["prompt"]
    if mode == "FLUX" and category in ("buildings", "houses"):
        clause = DECORATION_ISOLATION_CLAUSE if entry.get("decoration") else ISOLATION_CLAUSE
        prompt_text = f"{prompt_text}, {clause}"

    guide = entry.get("guide")
    denoise_override = entry.get("denoise")

    # Raffinement depuis l'image déjà générée, si activé et qu'elle existe.
    if REFINE_FROM_EXISTING and category in ("buildings", "houses"):
        existing_path = os.path.join(OUTPUT_DIR, category, entry["output"])
        if os.path.exists(existing_path):
            guide = existing_path
            denoise_override = entry.get("refine_denoise", REFINE_DENOISE)
            print(f"-> Raffinement depuis l'image existante : {existing_path}")

    # img2img si un guide est fourni ET présent sur le disque, sinon txt2img.
    image_filename = None
    if guide:
        if os.path.exists(guide):
            print(f"-> Upload du guide : {guide}")
            image_filename = upload_image(guide)
        else:
            print(f"-> Guide '{guide}' introuvable, bascule en txt2img pour cet asset.")

    if image_filename:
        denoise = denoise_override if denoise_override is not None else DENOISE
        gen_mode = "img2img"
    else:
        denoise = 1.0
        gen_mode = "txt2img"

    print(f"-> Génération ({mode=}, {gen_mode=}, {denoise=}, {GEN_SIZE=})...")
    seed = random.randint(0, 2**31 - 1)

    if mode == "FLUX":
        workflow = build_workflow_flux(prompt_text, seed, denoise, negative, image_filename)
    else:
        workflow = build_workflow_illustrious(
            prompt_text, seed, denoise, negative, image_filename,
            lora_name=render.get("lora_name"),
        )

    prompt_id = queue_prompt(workflow)

    print(f"-> En attente du résultat (prompt_id={prompt_id})...")
    result = wait_for_result(prompt_id)

    outputs = result.get("outputs", {})
    if "9" not in outputs:
        raise RuntimeError(
            f"Pas d'image produite pour ce prompt. Contenu complet de l'entrée d'historique : {result}"
        )
    images_info = outputs["9"]["images"][0]
    raw_bytes = fetch_image_bytes(
        images_info["filename"], images_info["subfolder"], images_info["type"]
    )

    out_dir = os.path.join(OUTPUT_DIR, category)
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, entry["output"])
    final_size = entry.get("final_size", defaults["final_size"])
    finalize_asset(
        raw_bytes,
        output_path,
        remove_bg=defaults["remove_bg"],
        iso_tile=defaults["iso_tile"],
        final_size=final_size,
    )
    print(f"-> Asset finalisé : {output_path}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Génère les sprites Olympos via ComfyUI (batch ou asset unique)."
    )
    parser.add_argument(
        "--only",
        metavar="FICHIER",
        help="Ne générer qu'un seul asset (ex: grandTemple.png)",
    )
    parser.add_argument(
        "--phase1-culture",
        action="store_true",
        help="Phase 1 : uniquement agora, theatre, gymnasium, stoa, academy (manquants seulement)",
    )
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Ignore les assets déjà présents dans sprites_out ou assets/",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Régénérer même si le fichier existe déjà (ignore SKIP_EXISTING)",
    )
    parser.add_argument(
        "--list-missing",
        action="store_true",
        help="Liste les textures Phase 1 culture manquantes puis quitte (sans ComfyUI)",
    )
    parser.add_argument(
        "--list-missing-all",
        action="store_true",
        help="Liste toutes les textures ASSETS absentes de sprites_out/ et assets/ puis quitte",
    )
    parser.add_argument(
        "--gaps-only",
        action="store_true",
        help="Uniquement les textures manquantes du jeu (fishery, carrotFarm, domaine…)",
    )
    args = parser.parse_args()

    if args.list_missing:
        missing, present = filter_missing_assets(PHASE1_CULTURE_ASSETS)
        print("=== Phase 1 culture — textures batiments ===")
        for e in PHASE1_CULTURE_ASSETS:
            status = "OK" if e not in missing else "MANQUANT"
            print(f"  [{status}] {e['output']}")
        print(f"\n{present}/{len(PHASE1_CULTURE_ASSETS)} déjà présents, {len(missing)} à générer.")
        raise SystemExit(0)

    if args.list_missing_all:
        ai_assets = [
            e for e in ASSETS
            if not (e["category"] == "tiles" and TILE_MODE == "PROCEDURAL")
        ]
        missing, present = filter_missing_assets(ai_assets)
        print("=== Toutes les textures ComfyUI (hors tuiles procédurales) ===")
        for e in ai_assets:
            status = "OK" if e not in missing else "MANQUANT"
            print(f"  [{status}] {e['category']}/{e['output']}")
        print(f"\n{present}/{len(ai_assets)} déjà présents, {len(missing)} à générer.")
        if missing:
            print("\nRelance ciblé :")
            for e in missing:
                print(f"  python comfy_batch_generate.py --only {e['output']}")
        raise SystemExit(0)

    assets = ASSETS
    if args.gaps_only:
        assets = list(GAPS_ASSETS)
        missing, present = filter_missing_assets(assets)
        print(f"=== Textures manquantes (gaps) : {len(missing)} à générer "
              f"({present}/{len(assets)} déjà présentes) ===\n")
        if not missing and not args.force:
            print("Rien à faire. Utilisez --force pour régénérer quand même.")
            raise SystemExit(0)
        if not args.force:
            assets = missing
    elif args.phase1_culture:
        assets = list(PHASE1_CULTURE_ASSETS)
        missing, present = filter_missing_assets(assets)
        print(f"=== Phase 1 culture : {len(missing)} texture(s) à générer "
              f"({present} déjà présentes, ignorées) ===\n")
        if not missing and not args.force:
            print("Rien à faire. Utilisez --force pour régénérer quand même.")
            raise SystemExit(0)
        if not args.force:
            assets = missing
    elif args.only:
        only_name = args.only if args.only.endswith(".png") else f"{args.only}.png"
        assets = [a for a in ASSETS if a["output"] == only_name]
        if not assets:
            raise SystemExit(f"Asset inconnu : {only_name}")
        print(f"Mode ciblé : {only_name}\n")
    elif args.missing_only:
        assets, present = filter_missing_assets(assets)
        print(f"=== Mode missing-only : {len(assets)} asset(s) à générer "
              f"({present} déjà présents) ===\n")
        if not assets and not args.force:
            print("Rien à faire.")
            raise SystemExit(0)

    total = len(assets)
    done = 0
    skipped = 0
    failures = []
    skip_existing = (SKIP_EXISTING or args.phase1_culture or args.missing_only or args.gaps_only) and not args.force

    print(f"=== Génération batch de {total} assets "
          f"(batiments/maisons={BUILDINGS_MODE}, terrains={TILES_MODE}) ===")
    print(f"Dossier de sortie : {OUTPUT_DIR}\n")

    if REFINE_FROM_EXISTING and skip_existing:
        print("ATTENTION : REFINE_FROM_EXISTING=True mais SKIP_EXISTING=True -> tous les")
        print("            assets déjà présents seront ignorés, donc RIEN ne sera raffiné.")
        print("            Mets SKIP_EXISTING = False pour que le raffinement fonctionne.\n")

    for i, entry in enumerate(assets, 1):
        category = entry["category"]
        out_path = os.path.join(OUTPUT_DIR, category, entry["output"])
        print(f"[{i}/{total}] {category}/{entry['output']}")

        # Les tuiles procédurales sont instantanées : on les régénère toujours
        # (pratique pour itérer sur l'apparence), SKIP_EXISTING ne s'y applique pas.
        is_procedural_tile = category == "tiles" and TILE_MODE == "PROCEDURAL"
        if skip_existing and not is_procedural_tile and sprite_exists(entry):
            print("   déjà présent (sprites_out ou assets/), ignoré.\n")
            skipped += 1
            continue

        success = False
        for attempt in range(1, RETRIES + 2):
            try:
                if category == "tiles" and TILE_MODE == "PROCEDURAL":
                    generate_tile_procedural(entry)  # textures de sol : PIL, pas d'IA
                else:
                    generate_asset(entry)
                success = True
                done += 1
                break
            except Exception as exc:
                if attempt <= RETRIES:
                    print(f"   échec (tentative {attempt}), nouvelle tentative : {exc}\n")
                    time.sleep(2)
                else:
                    print(f"   ÉCHEC définitif après {attempt} tentative(s) : {exc}\n")
                    failures.append((f"{category}/{entry['output']}", str(exc)))

    print("=" * 50)
    print(f"Terminé : {done} générés, {skipped} ignorés, {len(failures)} en échec.")
    if failures:
        print("Assets en échec (relance le script pour réessayer) :")
        for name, err in failures:
            print(f"  - {name} : {err}")
    print("Sprites disponibles dans :", OUTPUT_DIR)
