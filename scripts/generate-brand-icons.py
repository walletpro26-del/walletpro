"""Render the code-defined green rupee/wave mark into web and Android assets.

Run from the repository root with Python and Pillow. No source photos or old
bitmap icons are modified: all exports are drawn from the geometry below.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = '#202b27'
GREEN = '#286348'
SCALE = 40


def mark(size, maskable=False):
    canvas = Image.new('RGBA', (40 * SCALE, 40 * SCALE), BACKGROUND if maskable else (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    def line(points, fill, width):
        draw.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=fill, width=round(width * SCALE), joint='curve')
    inset = 5 if maskable else 2
    draw.rounded_rectangle((inset*SCALE, inset*SCALE, (40-inset)*SCALE, (40-inset)*SCALE), radius=8*SCALE, fill=GREEN)
    # Rupee, built from strokes rather than depending on a platform font.
    line([(14, 11), (26, 11)], 'white', 1.9)
    line([(14, 15.5), (26, 15.5)], 'white', 1.9)
    line([(17.5, 11), (20.5, 12.5), (21.5, 15), (20.5, 18), (18, 19.5), (14.5, 19.5), (24, 27)], 'white', 1.9)
    wave = [(9 + i * .22, 30 + math.sin(i * math.pi / 25) * 1.2) for i in range(101)]
    line(wave, '#bdd9c9', 1)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save(path, size, maskable=False):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    mark(size, maskable).save(target)


for size in (192, 512):
    save(f'public/icon-{size}.png', size)
    save(f'public/icon-maskable-{size}.png', size, True)

for density, launcher, maskable, splash in [('mdpi', 48, 82, 300), ('hdpi', 72, 123, 450), ('xhdpi', 96, 164, 600), ('xxhdpi', 144, 246, 900), ('xxxhdpi', 192, 328, 1200)]:
    save(f'app/src/main/res/mipmap-{density}/ic_launcher.png', launcher)
    save(f'app/src/main/res/mipmap-{density}/ic_maskable.png', maskable, True)
    save(f'app/src/main/res/drawable-{density}/splash.png', splash)

mark(256).save(ROOT / 'public/favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
