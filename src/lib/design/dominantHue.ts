/**
 * Dominant-hue extraction for card cover images.
 *
 * The card palette stays fixed (the six designed hue families below — fills,
 * borders, interiors are all derived from them), but instead of picking a
 * family by feed position, we read the cover image's dominant colour and snap
 * it to the *nearest* family. The result is always one of the designed,
 * theme-harmonious colours, yet it visibly belongs to the image.
 *
 * Pure math only — the browser/canvas (and Node/sharp backfill) wrappers live
 * elsewhere and feed pixels in.
 */

/** The designed card hue families (OKLCH hue, degrees). Order matters: it is
 *  the shared index for CARD_FILLS / CARD_BORDERS in StoryCard. */
export const CARD_HUES = [55, 290, 140, 88, 215, 18] as const;

/** sRGB (0–255) → OKLab → LCh. Returns { L, C, h } with h in degrees [0,360). */
export function rgbToOklch(r8: number, g8: number, b8: number): { L: number; C: number; h: number } {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bb);
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L, C, h };
}

/**
 * Chroma-weighted circular mean hue of an RGBA pixel buffer.
 *
 * Near-grey and near-transparent pixels carry no hue information and are
 * skipped; the rest vote with weight = chroma, so a small saturated subject
 * outvotes a large washed-out background. Returns null when the image is
 * essentially achromatic (no pixel clears the chroma floor).
 */
export function dominantHue(pixels: Uint8ClampedArray | Uint8Array): number | null {
  const CHROMA_FLOOR = 0.02;
  let x = 0;
  let y = 0;
  let weight = 0;
  const stride = 4;
  for (let i = 0; i + 3 < pixels.length; i += stride) {
    if (pixels[i + 3] < 128) continue; // transparent
    const { L, C, h } = rgbToOklch(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (C < CHROMA_FLOOR) continue; // grey — no hue vote
    if (L < 0.08 || L > 0.98) continue; // near black/white — hue unreliable
    const rad = (h * Math.PI) / 180;
    x += Math.cos(rad) * C;
    y += Math.sin(rad) * C;
    weight += C;
  }
  if (weight === 0) return null;
  let h = (Math.atan2(y, x) * 180) / Math.PI;
  if (h < 0) h += 360;
  return h;
}

/** Circular hue distance in degrees (0–180). */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Snap an arbitrary OKLCH hue to the nearest designed card hue family. */
export function nearestCardHue(hue: number): number {
  let best: number = CARD_HUES[0];
  let bestD = Infinity;
  for (const c of CARD_HUES) {
    const d = hueDistance(hue, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Index of a (snapped) hue in the palette; -1 when it isn't a palette hue. */
export function cardHueIndex(hue: number): number {
  return (CARD_HUES as readonly number[]).indexOf(hue);
}
