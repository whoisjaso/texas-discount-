#!/usr/bin/env python3
"""The demo licence the narrated cut's scanner shoots (narration.md section 9): a card printed "DEMO CARD / NOT A
GOVERNMENT ID" for the house demo buyer, front and back (the back carries the PDF417 make-demo-card.mjs encoded).

    python3 demo-card.py --pdf417 <pdf417.png> --out <dir> [--name "JAMES CARTER" --number 41927365 --dob 06/14/1988]

Writes <dir>/card-front.png and card-back.png: 1920x1080 "camera" frames (the card on a warm desk, as the test camera
feed shows it), plus card-front-flat.png / card-back-flat.png (the card alone, 1280x807). Fonts: the bundled DejaVu
Sans (assets/narrated, its licence beside it), so the card looks the same on any machine.
"""
import argparse
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "..", "assets", "narrated")
BOLD = os.path.join(FONTS, "DejaVuSans-Bold.ttf")
REG = os.path.join(FONTS, "DejaVuSans.ttf")
CW, CH = 1280, 807
W, H = 1920, 1080
PAPER, INK, GREY, BAR = (244, 244, 242), (17, 17, 17), (110, 110, 115), (31, 31, 33)


def font(path, size):
    return ImageFont.truetype(path, size)


def front(name, number, dob):
    c = Image.new("RGB", (CW, CH), PAPER)
    d = ImageDraw.Draw(c)
    d.rectangle([0, 0, CW, 130], fill=BAR)
    d.text((52, 30), "DEMO CARD", font=font(BOLD, 64), fill=(255, 255, 255))
    t = "NOT A GOVERNMENT ID"
    f = font(BOLD, 34)
    d.text((CW - 52 - d.textlength(t, font=f), 52), t, font=f, fill=(205, 205, 208))
    d.rounded_rectangle([60, 190, 380, 620], 20, fill=(205, 205, 208))
    d.ellipse([160, 260, 280, 380], fill=(174, 174, 178))
    d.rounded_rectangle([120, 400, 320, 620], 60, fill=(174, 174, 178))
    for i, (label, value) in enumerate([("NAME", name), ("NO.", number), ("DOB", dob)]):
        y = 190 + i * 160
        d.text((440, y), label, font=font(REG, 32), fill=GREY)
        d.text((440, y + 45), value, font=font(BOLD, 68), fill=INK)
    d.text((60, 692), "Sample card for the sale-desk demo film", font=font(REG, 32), fill=GREY)
    return c


def back(pdf417):
    c = Image.new("RGB", (CW, CH), PAPER)
    d = ImageDraw.Draw(c)
    d.text((52, 40), "DEMO CARD · NOT A GOVERNMENT ID", font=font(BOLD, 40), fill=(80, 80, 85))
    bc = Image.open(pdf417).convert("RGB")
    bw = int(CW * 0.9)
    bh = int(bw / 3.9)
    c.paste(bc.resize((bw, bh), Image.NEAREST), ((CW - bw) // 2, (CH - bh) // 2 + 20))
    return c


def on_desk(card):
    """the card as the test camera sees it: 650 px wide on a warm gradient, a soft shadow, rounded corners"""
    bg = Image.new("RGB", (W, H))
    dd = ImageDraw.Draw(bg)
    for y in range(H):
        dd.line([(0, y), (W, y)], fill=(74 - y // 40, 66 - y // 45, 58 - y // 50))
    cw2 = 650
    ch2 = int(cw2 * CH / CW)
    small = card.resize((cw2, ch2), Image.LANCZOS)
    x, y = (W - cw2) // 2, (H - ch2) // 2 - int(20 * cw2 / CW)
    sh = Image.new("RGBA", (cw2 + 60, ch2 + 60), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([30, 38, cw2 + 30, ch2 + 38], 20, fill=(0, 0, 0, 130))
    sh = sh.filter(ImageFilter.GaussianBlur(10))
    bg.paste(sh, (x - 30, y - 30), sh)
    m = Image.new("L", small.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, cw2 - 1, ch2 - 1], 22, fill=255)
    bg.paste(small, (x, y), m)
    return bg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf417", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="JAMES CARTER")
    ap.add_argument("--number", default="41927365")
    ap.add_argument("--dob", default="06/14/1988")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    f, b = front(a.name, a.number, a.dob), back(a.pdf417)
    f.save(os.path.join(a.out, "card-front-flat.png"))
    b.save(os.path.join(a.out, "card-back-flat.png"))
    on_desk(f).save(os.path.join(a.out, "card-front.png"))
    on_desk(b).save(os.path.join(a.out, "card-back.png"))
    print("card:", ", ".join(os.path.join(a.out, n) for n in ["card-front.png", "card-back.png"]))


if __name__ == "__main__":
    main()
