#!/usr/bin/env python3
"""Turns the recorded clips into the promo video (16:9 and 9:16). Usage: compose.py <clips dir> <output dir>"""
import json, subprocess, sys, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

CLIPS, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
TMP = os.path.join(OUT, "_tmp"); os.makedirs(TMP, exist_ok=True)
FONT = "/usr/share/fonts/opentype/inter/"
def font(weight, size): return ImageFont.truetype(FONT + f"Inter-{weight}.otf", size)

CORAL = (184, 58, 47); INK = (38, 30, 28); MUTED = (112, 98, 92); CREAM = (247, 243, 240)
NOTE = "Shown with demo data for a fictional shop."

SCENES = [
  ("01-money-book", "Every pound in and out,\nin one place.", "Takings, bills and costs, each with a note that says what it was.", 8.0),
  ("02-send-a-sheet", "Fill in a spreadsheet.\nCheck it before it is saved.", "Excel or CSV. Every row is checked, and anything that looks already recorded is held back.", 14.0),
  ("03-bills", "Supplier bills, followed\nthrough to payment.", "See what is paid, what is due and what is late.", 7.5),
  ("04-owed", "Who owes you,\nand who you owe.", "Late payments come first, with a polite reminder ready to copy.", 8.0),
  ("05-staff-expenses", "Staff send claims.\nYou stay in charge.", "Likely duplicates are flagged before you approve. Nothing reaches the books until you pay it back.", 9.5),
  ("06-weekly-summary", "Your week, summed up\nevery Monday.", "Money in and out, what is owed, what is running low and who is waiting.", 8.0),
  ("07-dark-mode", "Light or dark,\nwhichever suits.", "Made for the phone, in the shop or on the road.", 9.5),
]

def gradient(w, h):
    img = Image.new("RGB", (w, h), CREAM); px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / w) * 0.55 + (1 - y / h) * 0.2
            px[x, y] = (int(CREAM[0] + (250 - CREAM[0]) * 0.0 + (-8) * t), int(CREAM[1] - 14 * t), int(CREAM[2] - 22 * t))
    return img

def wrap(draw, text, fnt, width):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            test = (cur + " " + word).strip()
            if draw.textlength(test, font=fnt) <= width: cur = test
            else: lines.append(cur); cur = word
        lines.append(cur)
    return lines

def mark(draw, x, y, size):
    draw.rounded_rectangle((x, y, x + size, y + size), radius=size // 4, fill=CORAL)
    draw.rounded_rectangle((x + size * .24, y + size * .28, x + size * .76, y + size * .62), radius=size * .1, fill="white")
    draw.polygon([(x + size * .36, y + size * .6), (x + size * .36, y + size * .78), (x + size * .52, y + size * .6)], fill="white")

def phone_shadow_and_bezel(pw, ph, pad=14, radius=58):
    """A bezel to lay over the footage (transparent window) and a soft shadow for under it."""
    W, H = pw + pad * 2, ph + pad * 2
    bez = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(bez)
    d.rounded_rectangle((0, 0, W - 1, H - 1), radius=radius + pad, fill=(24, 20, 19, 255))
    mask = Image.new("L", (W, H), 0); ImageDraw.Draw(mask).rounded_rectangle((pad, pad, W - pad - 1, H - pad - 1), radius=radius, fill=255)
    bez.putalpha(Image.eval(mask, lambda v: 255 - v).point(lambda v: v))
    ring = Image.new("RGBA", (W, H), (24, 20, 19, 255)); ring.putalpha(Image.eval(mask, lambda v: 255 - v))
    # outer rounded corners
    outer = Image.new("L", (W, H), 0); ImageDraw.Draw(outer).rounded_rectangle((0, 0, W - 1, H - 1), radius=radius + pad, fill=255)
    a = Image.composite(ring.getchannel("A"), Image.new("L", (W, H), 0), outer)
    ring.putalpha(a)
    shadow = Image.new("RGBA", (W + 160, H + 160), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((80, 100, W + 80, H + 100), radius=radius + pad, fill=(60, 30, 20, 90))
    return ring, shadow.filter(ImageFilter.GaussianBlur(28))

def scene_card(path, headline, sub, size, vertical):
    w, h = size; img = gradient(w, h).convert("RGBA"); d = ImageDraw.Draw(img)
    if not vertical:
        pw, ph = 434, 940; px, py = 1270, (h - ph) // 2
        ring, shadow = phone_shadow_and_bezel(pw, ph)
        img.alpha_composite(shadow, (px - 14 - 80, py - 14 - 80))
        img.alpha_composite(ring, (px - 14, py - 14))
        x = 130; mark(d, x, 110, 52); d.text((x + 70, 118), "ReplyFlow", font=font("SemiBold", 34), fill=INK)
        hf = font("Bold", 74); y = 330
        for line in headline.split("\n"):
            d.text((x, y), line, font=hf, fill=INK); y += 92
        sf = font("Regular", 33); y += 26
        for line in wrap(d, sub, sf, 880):
            d.text((x, y), line, font=sf, fill=MUTED); y += 48
        d.rounded_rectangle((x, y + 30, x + 120, y + 36), radius=3, fill=CORAL)
        d.text((x, h - 90), NOTE, font=font("Regular", 24), fill=MUTED)
    else:
        pw, ph = 700, 1514; px, py = (w - pw) // 2, 470
        ring, shadow = phone_shadow_and_bezel(pw, ph, pad=16, radius=70)
        img.alpha_composite(shadow, (px - 16 - 80, py - 16 - 80))
        img.alpha_composite(ring, (px - 16, py - 16))
        mark(d, 70, 70, 46); d.text((136, 76), "ReplyFlow", font=font("SemiBold", 32), fill=INK)
        y = 160
        for line in headline.split("\n"):
            d.text((70, y), line, font=font("Bold", 62), fill=INK); y += 76
        y += 14
        for line in wrap(d, sub, font("Regular", 30), w - 140):
            d.text((70, y), line, font=font("Regular", 30), fill=MUTED); y += 42
        d.text((70, h - 56), NOTE, font=font("Regular", 22), fill=MUTED)
    img.convert("RGB").save(path)
    return px, py, pw, ph, ring.size

def title_card(path, big, small, size, foot=None):
    w, h = size; img = gradient(w, h).convert("RGBA"); d = ImageDraw.Draw(img)
    s = 110 if w > h else 96
    mark(d, (w - s) // 2, int(h * .3), s)
    bf = font("Bold", 96 if w > h else 84); tw = d.textlength(big, font=bf)
    d.text(((w - tw) // 2, int(h * .3) + s + 40), big, font=bf, fill=INK)
    sf = font("Regular", 38 if w > h else 34); y = int(h * .3) + s + 170
    for line in wrap(d, small, sf, w - 240):
        lw = d.textlength(line, font=sf); d.text(((w - lw) // 2, y), line, font=sf, fill=MUTED); y += 54
    if foot:
        ff = font("Regular", 26); fw = d.textlength(foot, font=ff); d.text(((w - fw) // 2, h - 90), foot, font=ff, fill=MUTED)
    img.convert("RGB").save(path)

def run(*args): subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)

def build(vertical):
    size = (1080, 1920) if vertical else (1920, 1080); tag = "vertical" if vertical else "wide"
    parts = []
    title_card(f"{TMP}/{tag}_intro.png", "ReplyFlow", "Messages, orders and money for small businesses, in one app.", size)
    run("-loop", "1", "-t", "3.6", "-i", f"{TMP}/{tag}_intro.png", "-vf", "fade=t=in:d=0.4,fade=t=out:st=3.2:d=0.4,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", f"{TMP}/{tag}_intro.mp4")
    parts.append(f"{TMP}/{tag}_intro.mp4")
    for name, head, sub, dur in SCENES:
        trim = json.load(open(f"{CLIPS}/{name}.json"))["trim"]
        card = f"{TMP}/{tag}_{name}.png"
        px, py, pw, ph, ring = scene_card(card, head, sub, size, vertical)
        bez = f"{TMP}/{tag}_bezel.png"; phone_shadow_and_bezel  # bezel image saved below
        r, _ = phone_shadow_and_bezel(pw, ph, 16 if vertical else 14, 70 if vertical else 58); r.save(bez)
        pad = 16 if vertical else 14
        out = f"{TMP}/{tag}_{name}.mp4"
        run("-loop", "1", "-t", str(dur), "-i", card, "-ss", str(trim), "-t", str(dur), "-i", f"{CLIPS}/{name}.webm", "-loop", "1", "-t", str(dur), "-i", bez,
            "-filter_complex", f"[1:v]crop=390:844:0:0,fps=30,scale={pw}:{ph}:flags=lanczos[p];[0:v][p]overlay={px}:{py}[a];[a][2:v]overlay={px - pad}:{py - pad},fade=t=in:d=0.3,fade=t=out:st={dur - 0.3}:d=0.3,format=yuv420p[v]",
            "-map", "[v]", "-r", "30", "-c:v", "libx264", "-crf", "19", "-preset", "medium", out)
        parts.append(out)
    title_card(f"{TMP}/{tag}_outro.png", "ReplyFlow", "Messenger inbox  ·  Orders  ·  Posting  ·  Money", size, NOTE)
    run("-loop", "1", "-t", "4", "-i", f"{TMP}/{tag}_outro.png", "-vf", "fade=t=in:d=0.4,fade=t=out:st=3.6:d=0.4,fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", f"{TMP}/{tag}_outro.mp4")
    parts.append(f"{TMP}/{tag}_outro.mp4")
    lst = f"{TMP}/{tag}_list.txt"; open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    final = f"{OUT}/replyflow-features-{tag}.mp4"
    run("-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", "-movflags", "+faststart", final)
    print("wrote", final)

build(False)
if "--vertical" in sys.argv: build(True)
