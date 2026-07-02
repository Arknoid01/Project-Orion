"""Placeholder colline — dérivé de grass.png, teinte olive/sèche (bloc iso + tuile plate)."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BLOCK_SRC = ROOT / 'assets' / 'tiles' / 'blocks' / 'grass.png'
BLOCK_OUT = ROOT / 'assets' / 'tiles' / 'blocks' / 'hill.png'
FLAT_SRC = ROOT / 'assets' / 'tiles' / 'grass.png'
FLAT_OUT = ROOT / 'assets' / 'tiles' / 'hill.png'


def tint_hill(img):
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 16:
                continue
            px[x, y] = (
                min(255, int(r * 0.90 + 32)),
                min(255, int(g * 0.72 + 22)),
                min(255, int(b * 0.50 + 10)),
                a,
            )
    return img


def write_placeholder(src, out):
    img = Image.open(src).convert('RGBA')
    tint_hill(img)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f'Wrote {out} ({img.size[0]}x{img.size[1]})')


def main():
    write_placeholder(BLOCK_SRC, BLOCK_OUT)
    write_placeholder(FLAT_SRC, FLAT_OUT)

if __name__ == '__main__':
    main()
