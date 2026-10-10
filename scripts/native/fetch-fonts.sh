#!/usr/bin/env bash
# Download the web's typefaces for the native apps into native/fonts/
# (gitignored). All are SIL OFL 1.1 — bundling in apps is allowed; the OFL
# forbids selling the fonts on their own and reserves 陳宇落雁's name for
# unmodified copies.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/../.." && pwd)/native/fonts"
mkdir -p "$DEST"
fetch() { [ -s "$DEST/$2" ] || curl -sSfL "$1" -o "$DEST/$2"; echo "  $2 $(du -h "$DEST/$2" | cut -f1)"; }
echo "Fonts → $DEST"
fetch "https://github.com/google/fonts/raw/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf" PlayfairDisplay.ttf
fetch "https://github.com/google/fonts/raw/main/ofl/dmsans/DMSans%5Bopsz%2Cwght%5D.ttf" DMSans.ttf
fetch "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC%5Bwght%5D.ttf" NotoSansTC.ttf
fetch "https://github.com/google/fonts/raw/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf" NotoSerifTC.ttf
fetch "https://cdn.jsdelivr.net/gh/Chenyu-otf/chenyuluoyan_thin/ChenYuluoyan-2.0-Thin.ttf" ChenYuluoyanThin.ttf
