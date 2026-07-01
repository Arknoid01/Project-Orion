#!/usr/bin/env python3
"""Nettoie et vérifie les sprites assets/mediterranean (fond blanc → transparent)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
MED_DIR = ROOT / "assets" / "mediterranean"
MANIFEST = MED_DIR / "manifest.json"

sys.path.insert(0, str(ROOT / "tools"))
from clean_tree_sprites import clean_tree_sprite, whiteness, saturation  # noqa: E402


def count_near_white(im: Image.Image, threshold: int = 200) -> int:
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    n = 0
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            wv = whiteness(r, g, b)
            sat = saturation(r, g, b)
            if wv >= threshold and sat <= 55:
                n += 1
    return n


def count_opaque(im: Image.Image) -> int:
    im = im.convert("RGBA")
    px = im.load()
    return sum(1 for y in range(im.size[1]) for x in range(im.size[0]) if px[x, y][3] >= 16)


def main() -> None:
    pngs = sorted(MED_DIR.glob("*.png"))
    if not pngs:
        print("Aucun PNG dans assets/mediterranean")
        return

    manifest_entries: dict[str, dict] = {}
    if MANIFEST.exists():
        for entry in json.loads(MANIFEST.read_text(encoding="utf-8")):
            name = Path(entry["file"]).name
            manifest_entries[name] = entry

    print(f"Traitement de {len(pngs)} sprites…")
    issues: list[str] = []

    for path in pngs:
        before = Image.open(path)
        white_before = count_near_white(before)
        opaque_before = count_opaque(before)

        after = clean_tree_sprite(before, white_threshold=208, soft_range=72, max_depth=30)
        after.save(path)

        white_after = count_near_white(after)
        opaque_after = count_opaque(after)

        entry = manifest_entries.get(path.name)
        expected = entry.get("size") if entry else None
        size_note = ""
        if expected and len(expected) == 2:
            ew, eh = expected
            aw, ah = after.size
            if abs(aw - ew) > 24 or abs(ah - eh) > 24:
                size_note = f"  [taille manifest {ew}x{eh} vs {aw}x{ah}]"

        status = "OK" if white_after <= 3 else "WARN"
        if white_after > 12:
            status = "FAIL"
            issues.append(f"{path.name}: {white_after} pixels blancs restants")

        if opaque_after < 40:
            status = "FAIL"
            issues.append(f"{path.name}: sprite quasi vide ({opaque_after} px opaques)")

        print(
            f"{status} {path.name}: {before.size} -> {after.size}, "
            f"blanc {white_before}->{white_after}, opaque {opaque_before}->{opaque_after}{size_note}"
        )

    if issues:
        print("\nProblèmes détectés :")
        for line in issues:
            print(f"  - {line}")
        sys.exit(1)

    print("\nTous les sprites sont propres.")


if __name__ == "__main__":
    main()
