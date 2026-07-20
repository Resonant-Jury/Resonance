#!/usr/bin/env python3
"""Generate the native app icon set in resources/ for @capacitor/assets.

Design: solid paper background (tokens.css --color-bg #FAF2E9) with the
Resonance three-wave mark (same geometry as public/icon.svg and
atoms/Icon/icons/wave.tsx) in terracotta — no border tile, because iOS and
Android both apply their own mask and a drawn border clashes with the
platform's corner radius.

Waves are cubic beziers evaluated directly and stroked by stamping round
brush dots at 4x supersampling, then downscaled — no SVG rasterizer needed.

Outputs (all consumed by `npx @capacitor/assets generate --assetPath resources`):
  resources/icon-only.png        1024x1024, bg + waves
  resources/icon-foreground.png  1024x1024, waves only (adaptive-icon safe zone)
  resources/icon-background.png  1024x1024, solid bg
  resources/splash.png           2732x2732, bg + small waves
  resources/splash-dark.png      same as splash (site has a single light theme)
"""

from PIL import Image, ImageDraw

BG = (0xFA, 0xF2, 0xE9, 255)   # --color-bg paper
INK = (0xC9, 0x67, 0x36, 255)  # terracotta accent (matches public/icon.svg)

# The wave mark from public/icon.svg, in its 24-unit coordinate space:
# three strokes, each three chained cubic bezier segments.
WAVES = [
    [(3.4, 8.2), (5.4, 5.9), (7.3, 5.8), (9.2, 8.0),
     (11.1, 10.2), (13.0, 10.3), (15.0, 8.1),
     (16.9, 6.0), (18.8, 5.9), (20.7, 8.1)],
    [(3.0, 12.1), (5.1, 9.7), (7.1, 9.8), (9.0, 12.0),
     (10.9, 14.2), (12.9, 14.3), (14.9, 12.1),
     (16.8, 9.9), (18.8, 9.8), (20.9, 12.0)],
    [(3.5, 16.0), (5.4, 13.8), (7.4, 13.7), (9.3, 15.9),
     (11.2, 18.1), (13.1, 18.2), (15.1, 16.0),
     (17.0, 13.9), (18.9, 13.8), (20.8, 16.0)],
]
STROKE_UNITS = 2.2   # stroke-width in the 24-unit space
CONTENT_CENTER_Y = 12.0


def bezier(p0, p1, p2, p3, steps=160):
    for i in range(steps + 1):
        t = i / steps
        mt = 1 - t
        x = mt**3 * p0[0] + 3 * mt**2 * t * p1[0] + 3 * mt * t**2 * p2[0] + t**3 * p3[0]
        y = mt**3 * p0[1] + 3 * mt**2 * t * p1[1] + 3 * mt * t**2 * p2[1] + t**3 * p3[1]
        yield x, y


def draw_waves(draw, canvas_px, content_px, offset_y_px=0):
    """Stamp the wave mark centered on a canvas_px square canvas, scaled so
    the 24-unit box maps to content_px."""
    s = content_px / 24.0
    ox = (canvas_px - content_px) / 2.0
    oy = canvas_px / 2.0 - CONTENT_CENTER_Y * s + offset_y_px
    r = STROKE_UNITS * s / 2.0
    for stroke in WAVES:
        pts = []
        for seg in range(3):
            p0 = stroke[0] if seg == 0 else stroke[seg * 3]
            p1, p2, p3 = stroke[seg * 3 + 1], stroke[seg * 3 + 2], stroke[seg * 3 + 3]
            pts.extend(bezier(p0, p1, p2, p3))
        for x, y in pts:
            cx, cy = ox + x * s, oy + y * s
            draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=INK)


def render(canvas, content_ratio, background):
    ss = 4  # supersample factor
    big = canvas * ss
    img = Image.new('RGBA', (big, big), background)
    draw_waves(ImageDraw.Draw(img), big, int(big * content_ratio))
    return img.resize((canvas, canvas), Image.LANCZOS)


def main():
    import os
    os.chdir(os.path.join(os.path.dirname(__file__), '..'))
    os.makedirs('resources', exist_ok=True)

    # Main icon: waves fill ~66% of the tile.
    render(1024, 0.66, BG).save('resources/icon-only.png')
    # Adaptive-icon foreground: transparent, waves inside the ~40% safe zone
    # (the launcher mask can crop up to a third of each edge).
    render(1024, 0.40, (0, 0, 0, 0)).save('resources/icon-foreground.png')
    Image.new('RGBA', (1024, 1024), BG).save('resources/icon-background.png')

    # Splash: paste a supersampled transparent wave tile onto the big canvas
    # instead of supersampling the whole 2732px square.
    splash = Image.new('RGBA', (2732, 2732), BG)
    mark = render(600, 0.94, (0, 0, 0, 0))
    splash.paste(mark, ((2732 - 600) // 2, (2732 - 600) // 2), mark)
    splash.convert('RGB').save('resources/splash.png')
    splash.convert('RGB').save('resources/splash-dark.png')
    print('resources/ regenerated')


if __name__ == '__main__':
    main()
