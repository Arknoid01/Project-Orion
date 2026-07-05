#!/usr/bin/env python3
"""
Pipeline automatique nature : procédural OU fichiers .blend.

Usage :
  python tools/run_blender_nature.py              # low-poly procédural (défaut)
  python tools/run_blender_nature.py --blends     # fichiers .blend (manifeste JSON)
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PROCEDURAL = ROOT / "tools" / "blender_export_nature.py"
SCRIPT_BLENDS = ROOT / "tools" / "blender_render_blend_assets.py"


def find_blender() -> Path | None:
    env = os.environ.get("BLENDER_EXE") or os.environ.get("BLENDER")
    if env:
        p = Path(env)
        if p.is_file():
            if p.name.lower() == "blender-launcher.exe":
                sibling = p.parent / "blender.exe"
                if sibling.is_file():
                    return sibling
            return p

    which = shutil.which("blender")
    if which:
        return Path(which)

    candidates = [
        Path(r"C:\Program Files\Blender Foundation\Blender 5.0\blender.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 5.0\blender-launcher.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 4.4\blender.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 4.3\blender.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 4.2\blender.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 4.1\blender.exe"),
        Path(r"C:\Program Files\Blender Foundation\Blender 3.6\blender.exe"),
        Path("/Applications/Blender.app/Contents/MacOS/Blender"),
        Path("/usr/bin/blender"),
        Path("/snap/bin/blender"),
    ]
    for p in candidates:
        if p.is_file():
            return p
    return None


def run(cmd: list, label: str):
    print(f"\n=== {label} ===")
    print(" ", " ".join(str(c) for c in cmd))
    subprocess.run(cmd, cwd=ROOT, check=True)


def main():
    parser = argparse.ArgumentParser(description="Export nature sprites via Blender")
    parser.add_argument(
        "--blends",
        action="store_true",
        help="Utiliser tools/nature_blend_manifest.json au lieu du procédural",
    )
    args = parser.parse_args()

    blender = find_blender()
    if not blender:
        print(
            "Blender introuvable.\n\n"
            "1. Installe Blender : https://www.blender.org/download/\n"
            "2. Relance : python tools/run_blender_nature.py --blends\n\n"
            "Ou BLENDER_EXE=C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe"
        )
        sys.exit(1)

    script = SCRIPT_BLENDS if args.blends else SCRIPT_PROCEDURAL
    label = "Rendu .blend (manifeste)" if args.blends else "Rendu procédural (5 arbres + 3 buissons)"
    run([str(blender), "--background", "--python", str(script)], label)
    run([sys.executable, str(ROOT / "tools" / "postprocess_generated_nature.py")], "Post-traitement PNG")
    run([sys.executable, str(ROOT / "tools" / "gen_blender_nature_config.py")], "Config jeu")

    print(
        "\nTermine !\n"
        "   Sprites : assets/generated_nature/\n"
        "   Config  : js/generatedNatureSprites.js\n"
        "   Recharge le jeu (Ctrl+F5)."
    )


if __name__ == "__main__":
    main()
