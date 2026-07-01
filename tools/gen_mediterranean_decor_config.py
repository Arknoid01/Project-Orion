#!/usr/bin/env python3
"""Génère js/mediterraneanDecorSprites.js depuis assets/mediterranean/manifest.json."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets" / "mediterranean" / "manifest.json"
OUT = ROOT / "js" / "mediterraneanDecorSprites.js"
CACHE = 5


def tree_weight(name: str, stats: dict | None) -> float:
    """Cyprès / pins méditerranéens un peu plus fréquents."""
    if name in {"nature_tree_03.png", "nature_tree_04.png", "nature_tree_07.png"}:
        return 2.2
    if stats:
        green = stats.get("green", 0)
        floral = stats.get("floral", 0)
        if floral > 0.15:
            return 0.95
        if green > 0.75:
            return 1.35
    return 1.0


def main() -> None:
    entries = json.loads(MANIFEST.read_text(encoding="utf-8"))
    trees: list[tuple[str, float]] = []
    props: list[str] = []

    for entry in entries:
        rel = entry["file"].replace("\\", "/")
        name = Path(rel).name
        path = f"{rel}?v={CACHE}"
        kind = entry.get("kind", "small")
        if kind == "tree":
            trees.append((path, tree_weight(name, entry.get("stats"))))
        else:
            props.append(path)

    lines = [
        "// Généré par tools/gen_mediterranean_decor_config.py — ne pas éditer à la main.",
        "// Source unique : assets/mediterranean/",
        "const MEDITERRANEAN_TREE_SPRITES = [",
    ]
    for path, _ in trees:
        lines.append(f"  '{path}',")
    lines.append("];")
    lines.append("")
    lines.append("const MEDITERRANEAN_PROP_SPRITES = [")
    for path in props:
        lines.append(f"  '{path}',")
    lines.append("];")
    lines.append("")
    lines.append("const MEDITERRANEAN_TREE_VARIANT_WEIGHTS = [")
    for _, w in trees:
        wstr = str(round(w, 2)).rstrip("0").rstrip(".")
        lines.append(f"  {wstr},")
    lines.append("];")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Écrit {OUT.name} — {len(trees)} arbres, {len(props)} props.")


if __name__ == "__main__":
    main()
