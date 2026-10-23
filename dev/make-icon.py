"""Draws the temporary app icon (a small routing matrix with two active crossings): assets/icon.png and assets/icon.ico.
Run: python3 dev/make-icon.py   (needs Pillow). To be replaced by a real icon before the first public release."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle((32, 32, S - 32, S - 32), radius=200, fill=(23, 25, 29, 255))
n, pad, gap = 4, 150, 34
cell = (S - 2 * pad - (n - 1) * gap) // n
active = {(0, 1), (2, 3)}
for r in range(n):
    for c in range(n):
        x, y = pad + c * (cell + gap), pad + r * (cell + gap)
        on = (r, c) in active
        d.rounded_rectangle((x, y, x + cell, y + cell), radius=34, fill=(47, 179, 68, 255) if on else (53, 58, 67, 255))
os.makedirs(OUT, exist_ok=True)
img.save(os.path.join(OUT, "icon.png"))
img.save(os.path.join(OUT, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
