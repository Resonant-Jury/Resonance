#!/usr/bin/env python3
"""
Ship-ready fonts for the native apps (apps/shared/fonts/, committed), from the
full files fetched by fetch-fonts.sh into native/fonts/:

  * CJK faces are subset to Big5 level 1 (the 5,401 common characters) plus
    ASCII, CJK punctuation and full-width forms — 38 MB → ~13 MB.
  * TrueType hinting is removed. The handwriting face's hinting bytecode fails
    in Android's FreeType, which then reports a zero advance for *every* glyph
    (the font silently draws nothing); iOS and browsers never run it.
  * The Latin faces (Playfair Display, DM Sans) are small variable fonts and
    are copied as they are.

  python3 -m venv .venv-fonts && .venv-fonts/bin/pip install fonttools
  .venv-fonts/bin/python scripts/native/subset-fonts.py
"""
import shutil
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2] / "native" / "fonts"
OUT = Path(__file__).resolve().parents[2] / "apps" / "shared" / "fonts"


def charset() -> str:
    chars = set()
    for hi in range(0xA1, 0xC7):  # Big5 symbols (A1–A3) and level-1 hanzi (A4 40 – C6 7E)
        for lo in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            if (hi, lo) > (0xC6, 0x7E):
                continue
            try:
                chars.add(bytes([hi, lo]).decode("big5"))
            except UnicodeDecodeError:
                pass
    for a, b in [(0x20, 0x7E), (0xA0, 0xFF), (0x2010, 0x2027), (0x2030, 0x205E), (0x3000, 0x303F), (0xFF01, 0xFF5E)]:
        chars.update(chr(c) for c in range(a, b + 1))
    return "".join(sorted(chars))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    text = charset()
    for name in ["PlayfairDisplay.ttf", "DMSans.ttf"]:
        shutil.copy(ROOT / name, OUT / name)
    for name in ["NotoSansTC.ttf", "NotoSerifTC.ttf", "ChenYuluoyanThin.ttf"]:
        options = subset.Options()
        options.hinting = False
        options.layout_features = ["*"]
        options.name_IDs = ["*"]
        options.notdef_outline = True
        font = TTFont(ROOT / name)
        subsetter = subset.Subsetter(options)
        subsetter.populate(text=text)
        subsetter.subset(font)
        font.save(OUT / name)
    for f in sorted(OUT.iterdir()):
        before = (ROOT / f.name).stat().st_size
        print(f"{f.name:24} {before / 1e6:6.2f} MB → {f.stat().st_size / 1e6:6.2f} MB")


if __name__ == "__main__":
    main()
