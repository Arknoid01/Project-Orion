"""
Pipeline de génération des PERSONNAGES d'Olympos (walkers, dieux, monstres, héros).

Aligné sur le workflow ComfyUI « default » (Illustrious + LoRA Walking_Sprite) :
  - Checkpoint : illustriousXL_v01.safetensors
  - LoRA       : Walking_Sprite.safetensors (force 1.0 / 1.0)
  - Résolution : 832×1216 (feuille multi-vues chibi)
  - Sampler    : euler_ancestral / karras, 30 steps, cfg 5

Structure de prompt recommandée par le LoRA :
  chibi, multiple views, {description du personnage}, simple background, white background

Prérequis : pip install requests pillow --break-system-packages
ComfyUI local : http://127.0.0.1:8188
"""

import argparse
import io
import os
import random
import time

import requests
from PIL import Image

# ===================== CONFIG (cf. workflows/character_default.json) =====================
COMFY_URL = "http://127.0.0.1:8188"
CHECKPOINT = "illustriousXL_v01.safetensors"
CHARACTER_LORA_NAME = "Walking_Sprite.safetensors"
CHARACTER_LORA_STRENGTH = 1.0

GEN_WIDTH = 832
GEN_HEIGHT = 1216
STEPS = 30
CFG = 5.0
SAMPLER = "euler_ancestral"
SCHEDULER = "karras"

WHITE_THRESHOLD = 235
SKIP_EXISTING = True
RETRIES = 1
OUTPUT_DIR = "sprites_out/characters"
SAVE_FILENAME_PREFIX = "olympos_character"

BACKGROUND_PRESETS = {
    "white": {"prompt": "white background", "key": None, "threshold": WHITE_THRESHOLD, "tolerance": 0},
    "green": {"prompt": "solid mint green background", "key": (189, 229, 203), "tolerance": 48, "threshold": 0},
    "magenta": {"prompt": "solid magenta background", "key": (255, 0, 255), "tolerance": 90, "threshold": 0},
}
CURRENT_BACKGROUND = "white"

NEGATIVE_PROMPT = (
    "blurry, lowres, worst quality, low quality, bad anatomy, bad hands, "
    "jpeg artifacts, signature, watermark, text, logo, artist name, censored, patreon username"
)


def build_character_prompt(description, background=None):
    """Format LoRA : chibi, multiple views, {desc}, simple background, {couleur}."""
    bg = background or CURRENT_BACKGROUND
    bg_text = BACKGROUND_PRESETS.get(bg, BACKGROUND_PRESETS["white"])["prompt"]
    desc = description.strip().strip(",")
    return f"chibi, multiple views, {desc}, simple background, {bg_text}"


# ===================== LISTE DES PERSONNAGES =====================
# description : texte inséré dans build_character_prompt() (sans les mots-clés LoRA)
CHARACTERS = [
    # ---------- WALKERS ----------
    {
        "category": "walkers",
        "output": "water.png",
        "description": "young greek water carrier woman, light blue draped robe, "
                       "carrying a terracotta water jug on her shoulder",
    },
    {
        "category": "walkers",
        "output": "market.png",
        "description": "greek merchant, brown tunic, carrying woven baskets full of "
                       "fruit, olive oil jars, wine amphora and wool",
    },
    {
        "category": "walkers",
        "output": "religion.png",
        "description": "greek temple priest, white ceremonial robe, golden sash, "
                       "holding a ceremonial staff",
    },
    {
        "category": "walkers",
        "output": "health.png",
        "description": "greek physician healer, pale green robe, carrying a satchel "
                       "of herbs and bandages",
    },
    {
        "category": "walkers",
        "output": "tax.png",
        "description": "greek tax collector official, dark formal toga, holding a "
                       "wax tablet ledger and a coin pouch",
    },
    {
        "category": "walkers",
        "output": "fire.png",
        "description": "greek watchman fire warden, leather armor, holding a signal "
                       "horn and a lit torch",
    },

    # ---------- DIEUX ----------
    {
        "category": "gods",
        "output": "demeter.png",
        "description": "Demeter greek goddess of harvest, golden wheat crown, "
                       "flowing golden robes, holding a sheaf of wheat",
    },
    {
        "category": "gods",
        "output": "zeus.png",
        "description": "Zeus king of the greek gods, white beard, golden crown, "
                       "holding a lightning bolt, regal toga",
    },
    {
        "category": "gods",
        "output": "athena.png",
        "description": "Athena greek goddess of wisdom and war, bronze helmet, "
                       "holding a spear and shield, small owl on shoulder",
    },
    {
        "category": "gods",
        "output": "dionysos.png",
        "description": "Dionysos greek god of wine, ivy leaf crown, holding a wine "
                       "cup, grape vines draped around, purple robe",
    },
    {
        "category": "gods",
        "output": "poseidon.png",
        "description": "Poseidon greek god of the sea, holding a golden trident, "
                       "sea-green and blue robes, wet beard",
    },
    {
        "category": "gods",
        "output": "apollon.png",
        "description": "Apollo greek god of sun and healing, golden laurel crown, "
                       "holding a small lyre, radiant golden robes",
    },
    {
        "category": "gods",
        "output": "hera.png",
        "description": "Hera queen of the greek gods, ornate crown, peacock feather "
                       "motifs, regal purple and white robes, dignified pose",
    },
    {
        "category": "gods",
        "output": "ares.png",
        "description": "Ares greek god of war, bronze armor and helmet, holding a "
                       "sword and round shield, fierce expression",
    },
    {
        "category": "gods",
        "output": "hermes.png",
        "description": "Hermes greek messenger god, winged sandals, winged helmet, "
                       "holding a caduceus staff, light traveling tunic",
    },
    {
        "category": "gods",
        "output": "artemis.png",
        "description": "Artemis greek goddess of the hunt, holding a bow and arrow, "
                       "short hunting tunic, crescent moon hair ornament",
    },
    {
        "category": "gods",
        "output": "hephaistos.png",
        "description": "Hephaistos greek god of the forge, muscular blacksmith, "
                       "leather apron, holding a hammer, small anvil beside him",
    },
    {
        "category": "gods",
        "output": "aphrodite.png",
        "description": "Aphrodite greek goddess of love and beauty, flowing pink "
                       "and gold robes, rose and dove motifs, graceful pose",
    },
    {
        "category": "gods",
        "output": "hestia.png",
        "description": "Hestia greek goddess of the hearth, simple warm-toned robe, "
                       "holding a small hearth flame, gentle calm expression",
    },
    {
        "category": "gods",
        "output": "hades.png",
        "description": "Hades greek god of the underworld, dark robes, helm of "
                       "darkness, pale skin, holding a two-pronged staff",
    },

    # ---------- MONSTRES ----------
    {
        "category": "monsters",
        "output": "medusa.png",
        "description": "Medusa greek gorgon monster, snakes instead of hair, "
                       "scaly green-tinted skin, fierce glowing eyes",
    },
    {
        "category": "monsters",
        "output": "hydra.png",
        "description": "Hydra greek multi-headed serpent monster, several snake "
                       "heads, dark green scales, swamp creature",
    },
    {
        "category": "monsters",
        "output": "minotaur.png",
        "description": "Minotaur greek bull-headed monster, muscular humanoid body, "
                       "large bull horns, holding a large axe",
    },
    {
        "category": "monsters",
        "output": "cyclops.png",
        "description": "Cyclops greek one-eyed giant monster, single large eye, "
                       "massive muscular body, holding a wooden club",
    },
    {
        "category": "monsters",
        "output": "cerberus.png",
        "description": "Cerberus greek three-headed dog monster, dark fur, "
                       "three snarling heads, guarding pose",
    },

    # ---------- HEROS ----------
    {
        "category": "heroes",
        "output": "perseus.png",
        "description": "Perseus greek hero, holding a polished round shield and "
                       "short sword, winged sandals, confident pose",
    },
    {
        "category": "heroes",
        "output": "heracles.png",
        "description": "Heracles greek hero, lion skin cloak over shoulders, "
                       "muscular build, holding a large wooden club",
    },
    {
        "category": "heroes",
        "output": "theseus.png",
        "description": "Theseus greek hero, holding a short sword, a ball of red "
                       "thread tied at his belt, determined pose",
    },
    {
        "category": "heroes",
        "output": "ulysses.png",
        "description": "Ulysses greek hero, holding a wooden bow, traveler's cloak, "
                       "weathered adventurous look",
    },
    {
        "category": "heroes",
        "output": "bellerophon.png",
        "description": "Bellerophon greek hero, holding a spear, standing beside a "
                       "small white winged horse Pegasus",
    },
    {
        "category": "heroes",
        "output": "jason.png",
        "description": "Jason greek hero, holding a golden fleece draped over one "
                       "arm, small anchor symbol on belt, sailor cloak",
    },
    {
        "category": "heroes",
        "output": "achilles.png",
        "description": "Achilles greek armored warrior hero, bronze breastplate and "
                       "helmet, holding a sword and shield",
    },
    {
        "category": "heroes",
        "output": "orpheus.png",
        "description": "Orpheus greek musician hero, holding a golden lyre, "
                       "flowing light tunic, gentle thoughtful expression",
    },
]


# ===================== COMFYUI API (nœuds = workflows/character_default.json) =====================
def build_workflow(prompt_text, seed):
    """
    Graphe API équivalent au workflow UI :
      4  CheckpointLoaderSimple
      17 LoraLoader (Walking_Sprite)
      6/7 CLIPTextEncode (+ / -)
      5  EmptyLatentImage 832×1216
      3  KSampler
      8  VAEDecode
      9  SaveImage
    """
    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {"ckpt_name": CHECKPOINT},
        },
        "17": {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": CHARACTER_LORA_NAME,
                "strength_model": CHARACTER_LORA_STRENGTH,
                "strength_clip": CHARACTER_LORA_STRENGTH,
                "model": ["4", 0],
                "clip": ["4", 1],
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt_text, "clip": ["17", 1]},
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": NEGATIVE_PROMPT, "clip": ["17", 1]},
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": GEN_WIDTH, "height": GEN_HEIGHT, "batch_size": 1},
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": STEPS,
                "cfg": CFG,
                "sampler_name": SAMPLER,
                "scheduler": SCHEDULER,
                "denoise": 1.0,
                "model": ["17", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["3", 0], "vae": ["4", 2]},
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {"images": ["8", 0], "filename_prefix": SAVE_FILENAME_PREFIX},
        },
    }


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
    last_log = 0
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
def _color_dist(r, g, b, key):
    return ((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2) ** 0.5


def is_chroma_background_pixel(r, g, b, a, key, tolerance):
    """Fond chroma uniquement — ne retire pas le blanc du personnage."""
    if a < 8:
        return False
    if r >= 215 and g >= 215 and b >= 215:
        return False
    kr, kg, kb = key
    if kg >= kr and kg >= kb:
        if g < r + 10 or g < b + 8:
            return False
    elif kr >= kg and kb >= kg:
        if r < g + 15 and b < g + 15:
            return False
        return _color_dist(r, g, b, key) <= tolerance
    else:
        return False
    return _color_dist(r, g, b, key) <= tolerance


def remove_background(img, mode=None):
    mode = mode or CURRENT_BACKGROUND
    preset = BACKGROUND_PRESETS.get(mode, BACKGROUND_PRESETS["white"])
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size

    if preset["key"] is None:
        threshold = preset["threshold"]
        visited = set()
        stack = []

        def is_white_px(x, y):
            r, g, b, a = px[x, y]
            return a >= 8 and r >= threshold and g >= threshold and b >= threshold

        for x in range(w):
            if is_white_px(x, 0):
                stack.append((x, 0))
            if is_white_px(x, h - 1):
                stack.append((x, h - 1))
        for y in range(h):
            if is_white_px(0, y):
                stack.append((0, y))
            if is_white_px(w - 1, y):
                stack.append((w - 1, y))

        while stack:
            x, y = stack.pop()
            if (x, y) in visited:
                continue
            if not is_white_px(x, y):
                continue
            visited.add((x, y))
            px[x, y] = (0, 0, 0, 0)
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    stack.append((nx, ny))
        return img

    key = preset["key"]
    tolerance = preset["tolerance"]
    visited = set()
    stack = []

    def matches(x, y):
        r, g, b, a = px[x, y]
        return is_chroma_background_pixel(r, g, b, a, key, tolerance)

    for x in range(w):
        if matches(x, 0):
            stack.append((x, 0))
        if matches(x, h - 1):
            stack.append((x, h - 1))
    for y in range(h):
        if matches(0, y):
            stack.append((0, y))
        if matches(w - 1, y):
            stack.append((w - 1, y))

    while stack:
        x, y = stack.pop()
        if (x, y) in visited:
            continue
        if not matches(x, y):
            continue
        visited.add((x, y))
        px[x, y] = (0, 0, 0, 0)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                stack.append((nx, ny))

    return img


def remove_white_background(img, threshold=WHITE_THRESHOLD):
    return remove_background(img, "white")


def finalize_character(raw_bytes, output_path):
    """Conserve la feuille multi-vues (832×1216) — pas de réduction agressive."""
    img = Image.open(io.BytesIO(raw_bytes))
    img = remove_background(img)
    img.save(output_path)


# ===================== PIPELINE PRINCIPAL =====================
def generate_character(entry):
    prompt_text = build_character_prompt(entry["description"])
    seed = random.randint(0, 2**31 - 1)
    print(f"-> Prompt : {prompt_text[:120]}...")
    print(f"-> Génération ({GEN_WIDTH}×{GEN_HEIGHT}, {SAMPLER}, cfg={CFG}, steps={STEPS})...")

    workflow = build_workflow(prompt_text, seed)
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

    out_dir = os.path.join(OUTPUT_DIR, entry["category"])
    os.makedirs(out_dir, exist_ok=True)
    output_path = os.path.join(out_dir, entry["output"])
    finalize_character(raw_bytes, output_path)
    print(f"-> Personnage finalisé : {output_path}\n")
    if entry["category"] == "walkers":
        print("   Astuce : python tools/slice_walker_sheets.py pour déployer dans assets/characters/walkers/\n")
    elif entry["category"] in ("monsters", "heroes"):
        print(f"   Astuce : python tools/slice_walker_sheets.py --from sprites_out/characters/{entry['category']} "
              f"--to assets/characters/{entry['category']} --background green\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Génère les sprites personnages via ComfyUI.")
    parser.add_argument(
        "--only",
        metavar="FICHIER",
        help="Ne générer qu'un personnage (ex: water.png ou walkers/water.png)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Régénérer même si le fichier existe déjà",
    )
    parser.add_argument(
        "--background",
        choices=list(BACKGROUND_PRESETS.keys()),
        default="white",
        help="Fond de génération : white, green (vert menthe, recommandé), magenta",
    )
    args = parser.parse_args()

    CURRENT_BACKGROUND = args.background
    bg_prompt = BACKGROUND_PRESETS[CURRENT_BACKGROUND]["prompt"]

    characters = CHARACTERS
    if args.only:
        only = args.only.replace("\\", "/")
        if "/" in only:
            cat, name = only.split("/", 1)
            characters = [
                c for c in CHARACTERS
                if c["category"] == cat and c["output"] == (
                    name if name.endswith(".png") else f"{name}.png"
                )
            ]
        else:
            only_name = only if only.endswith(".png") else f"{only}.png"
            characters = [c for c in CHARACTERS if c["output"] == only_name]
        if not characters:
            raise SystemExit(f"Personnage inconnu : {args.only}")

    total = len(characters)
    done = 0
    skipped = 0
    failures = []
    skip_existing = SKIP_EXISTING and not args.force

    print(f"=== Génération de {total} personnages (Illustrious + {CHARACTER_LORA_NAME}) ===")
    print(f"Format prompt : chibi, multiple views, {{desc}}, simple background, {bg_prompt}\n")

    for i, entry in enumerate(characters, 1):
        out_path = os.path.join(OUTPUT_DIR, entry["category"], entry["output"])
        print(f"[{i}/{total}] {entry['category']}/{entry['output']}")

        if skip_existing and os.path.exists(out_path):
            print("   déjà présent, ignoré (SKIP_EXISTING).\n")
            skipped += 1
            continue

        success = False
        for attempt in range(1, RETRIES + 2):
            try:
                generate_character(entry)
                success = True
                done += 1
                break
            except Exception as exc:
                if attempt <= RETRIES:
                    print(f"   échec (tentative {attempt}), nouvelle tentative : {exc}\n")
                    time.sleep(2)
                else:
                    print(f"   ÉCHEC définitif après {attempt} tentative(s) : {exc}\n")
                    failures.append((f"{entry['category']}/{entry['output']}", str(exc)))

    print("=" * 50)
    print(f"Terminé : {done} générés, {skipped} ignorés, {len(failures)} en échec.")
    if failures:
        print("Personnages en échec (relance le script pour réessayer) :")
        for name, err in failures:
            print(f"  - {name} : {err}")
    print("Sprites disponibles dans :", OUTPUT_DIR)
