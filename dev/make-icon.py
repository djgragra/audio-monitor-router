"""Draws the app icon (a routing matrix: lines of inputs and outputs crossing, two crosspoints lit): assets/icon.png (1024),
assets/icon.ico. Run: python3 dev/make-icon.py   (needs Pillow). Drawn at 4x and reduced, so edges are smooth."""
import os
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
S, K = 1024, 4
W = S * K


def px(v):
    return int(v * K)


img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# tile with a soft vertical gradient
tile = Image.new("RGBA", (W, W), (0, 0, 0, 0))
td = ImageDraw.Draw(tile)
for y in range(W):
    t = y / W
    td.line((0, y, W, y), fill=(int(36 - 14 * t), int(40 - 15 * t), int(48 - 17 * t), 255))
mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(mask).rounded_rectangle((px(32), px(32), px(S - 32), px(S - 32)), radius=px(210), fill=255)
img.paste(tile, (0, 0), mask)
d = ImageDraw.Draw(img)

n = 4
x0, x1 = 190, S - 190
pos = [x0 + i * (x1 - x0) / (n - 1) for i in range(n)]
line = (86, 94, 108, 255)
w = px(26)
for p in pos:                       # inputs (rows) and outputs (columns)
    d.line((px(x0 - 70), px(p), px(x1 + 70), px(p)), fill=line, width=w)
    d.line((px(p), px(x0 - 70), px(p), px(x1 + 70)), fill=line, width=w)

lit = {(0, 1), (2, 3), (3, 0)}      # (row, column) of the active crosspoints
glow = Image.new("RGBA", (W, W), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for (r, c) in lit:
    cx, cy = px(pos[c]), px(pos[r])
    gd.ellipse((cx - px(80), cy - px(80), cx + px(80), cy + px(80)), fill=(60, 220, 100, 150))
glow = glow.filter(ImageFilter.GaussianBlur(px(28)))
img = Image.alpha_composite(img, glow)
d = ImageDraw.Draw(img)
for r in range(n):
    for c in range(n):
        cx, cy = px(pos[c]), px(pos[r])
        on = (r, c) in lit
        rad = px(44 if on else 30)
        d.ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=(70, 226, 104, 255) if on else (23, 26, 31, 255),
                  outline=None if on else line, width=px(10))

img = img.resize((S, S), Image.LANCZOS)
os.makedirs(OUT, exist_ok=True)
img.save(os.path.join(OUT, "icon.png"))
img.save(os.path.join(OUT, "icon.ico"), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
