#!/usr/bin/env python3
"""Cut a Facebook-style photo collage into its individual photos.

  crop_collage.py <collage> <out_dir> <slug> "name:x0,y0,x1,y1" ["name:x0,y0,x1,y1" ...]
                  [--inset 8] [--max 1400]

Boxes are pixel coordinates of each cell in the collage. Collage seams are
often not white, so estimate the boxes by eye (grids are usually halves or
thirds of the square), crop with a small --inset to stay off the seam, and
ALWAYS look at the contact sheet this writes (<out_dir>/<slug>-sheet.jpg)
before using the crops. Outputs <out_dir>/<slug>/<n>.webp in the order given,
so list the best exterior three-quarter shot first: it becomes the cover.
"""
import argparse
import os
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("collage")
ap.add_argument("out_dir")
ap.add_argument("slug")
ap.add_argument("cells", nargs="+")
ap.add_argument("--inset", type=int, default=8)
ap.add_argument("--max", type=int, default=1400)
a = ap.parse_args()

src = Image.open(a.collage).convert("RGB")
os.makedirs(os.path.join(a.out_dir, a.slug), exist_ok=True)
thumbs = []
for n, spec in enumerate(a.cells, 1):
    name, box = spec.split(":")
    x0, y0, x1, y1 = (int(v) for v in box.split(","))
    i = a.inset
    c = src.crop((x0 + i, y0 + i, x1 - i, y1 - i))
    if max(c.size) > a.max:
        c.thumbnail((a.max, a.max), Image.LANCZOS)
    path = os.path.join(a.out_dir, a.slug, f"{n}.webp")
    c.save(path, quality=84, method=6)
    print(path, name, c.size)
    t = c.copy()
    t.thumbnail((260, 260))
    thumbs.append(t)

sheet = Image.new("RGB", (266 * len(thumbs), 266), "white")
for k, t in enumerate(thumbs):
    sheet.paste(t, (266 * k, 0))
sheet.save(os.path.join(a.out_dir, f"{a.slug}-sheet.jpg"), quality=88)
print("contact sheet:", os.path.join(a.out_dir, f"{a.slug}-sheet.jpg"))
