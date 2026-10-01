#!/usr/bin/env python3
"""Turn a delivered image into a web-ready file for a photo slot.

  prepare_image.py <in> <out.webp> [--max 1800] [--trim] [--quality 82]
                   [--mobile-crop out-mobile.webp --focus-x 0.6 --ratio 0.62]

--trim         crop away fully transparent margins (for transparent PNG cut-outs)
--mobile-crop  also write a portrait crop centred on --focus-x (0..1 of width),
               width = height * --ratio, for the hero's phone version
Only Pillow is needed (numpy is not assumed to be installed).
"""
import argparse
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("out")
ap.add_argument("--max", type=int, default=1800, help="longest edge in px (never upscales)")
ap.add_argument("--quality", type=int, default=82)
ap.add_argument("--trim", action="store_true")
ap.add_argument("--mobile-crop")
ap.add_argument("--focus-x", type=float, default=0.6)
ap.add_argument("--ratio", type=float, default=0.62)
a = ap.parse_args()

im = Image.open(a.src)
keep_alpha = im.mode in ("RGBA", "LA") or "transparency" in im.info
im = im.convert("RGBA" if keep_alpha else "RGB")

if a.trim and keep_alpha:
    box = im.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox()
    if box:
        pad = 12
        im = im.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad)))

if max(im.size) > a.max:
    im.thumbnail((a.max, a.max), Image.LANCZOS)

im.save(a.out, quality=a.quality, method=6)
print(a.out, im.size, im.mode)

if a.mobile_crop:
    h = im.height
    w = int(h * a.ratio)
    cx = int(im.width * a.focus_x)
    left = max(0, min(im.width - w, cx - w // 2))
    m = im.crop((left, 0, left + w, h))
    m.save(a.mobile_crop, quality=a.quality, method=6)
    print(a.mobile_crop, m.size)
