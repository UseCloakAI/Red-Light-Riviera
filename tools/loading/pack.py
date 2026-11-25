#!/usr/bin/env python3
"""Pack the rendered loading layers for the web:
tools/loading/out/<id>-bg.png -> lowtide/media/loading/<id>-bg.jpg  (1920x1080, progressive)
tools/loading/out/<id>-fg.png -> lowtide/media/loading/<id>-fg.webp (1920x1080, alpha)"""
import glob, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "lowtide", "media", "loading")
os.makedirs(OUT, exist_ok=True)
for f in sorted(glob.glob(os.path.join(HERE, "out", "*-bg.png"))):
    sid = os.path.basename(f)[:-7]
    bg = Image.open(f).convert("RGB").resize((1920, 1080), Image.LANCZOS)
    bg.save(os.path.join(OUT, sid + "-bg.jpg"), quality=84, optimize=True, progressive=True)
    fg = Image.open(os.path.join(HERE, "out", sid + "-fg.png")).convert("RGBA").resize((1920, 1080), Image.LANCZOS)
    fg.save(os.path.join(OUT, sid + "-fg.webp"), quality=86, method=6)
    print(sid, os.path.getsize(os.path.join(OUT, sid + "-bg.jpg")) // 1024, "KB +", os.path.getsize(os.path.join(OUT, sid + "-fg.webp")) // 1024, "KB")
