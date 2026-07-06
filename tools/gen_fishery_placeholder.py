"""Placeholder pêcherie — dérivé du port (harbor), eau plus bleue, teinte légère."""
from PIL import Image, ImageEnhance
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'assets' / 'buildings' / 'harbor.png'
OUT = ROOT / 'assets' / 'buildings' / 'fishery.png'


def main():
    img = Image.open(SRC).convert('RGBA')
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            # Eau / reflets turquoise en bas du sprite
            if y > h * 0.42 and b > r * 0.85:
                px[x, y] = (
                    min(255, int(r * 0.55 + 20)),
                    min(255, int(g * 0.75 + 40)),
                    min(255, int(b * 1.05 + 35)),
                    a,
                )
            else:
                px[x, y] = (
                    min(255, int(r * 0.92 + 8)),
                    min(255, int(g * 0.88 + 6)),
                    min(255, int(b * 0.82 + 14)),
                    a,
                )
    img = ImageEnhance.Color(img).enhance(1.08)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT)
    print(f'Wrote {OUT} ({w}x{h})')


if __name__ == '__main__':
    main()
