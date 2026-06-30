from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
nature = sorted((ROOT / "assets/grass/nature").glob("*.png"))
ruins = sorted((ROOT / "assets/grass/ruins").glob("*.png"))
lines = ["const GRASS_DECOR_SPRITES = ["]
lines += [f"  'assets/grass/nature/{p.name}'," for p in nature]
lines.append("  // ruines (spawn rare)")
lines += [f"  'assets/grass/ruins/{p.name}'," for p in ruins]
lines.append("];")
out = ROOT / "js/grassDecorSprites.js"
out.write_text("\n".join(lines) + "\n", encoding="utf-8")
print(f"Wrote {len(nature)} nature + {len(ruins)} ruins -> {out}")
