import { penWave } from './wavyPath';
import { seedFromString } from './prng';
import { INK } from './strokes';

/** Width of one repeating tile: eight crests at the pen's 4.5px rhythm. */
export const WAVE_TILE = 36;
/** The tile is as tall as OrganicLink's stroke box, centred on the pen's line. */
export const WAVE_TILE_H = 6;
/** --color-terracotta, as sRGB: a data URI can't read the page's CSS variables. */
const TERRACOTTA = 'rgb(201,103,54)';

const cache = new Map<string, { rest: string; strong: string }>();

function tile(d: string, opacity: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WAVE_TILE}" height="${WAVE_TILE_H}" viewBox="0 -3 ${WAVE_TILE} ${WAVE_TILE_H}">` +
    `<path d="${d}" fill="none" stroke="${TERRACOTTA}" stroke-opacity="${opacity}" stroke-width="${INK}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The pen-wave underline of a link inside story text, as CSS `url()` values
 * for a repeating background: one at rest (~0.7 opacity) and one for hover and
 * press. A tile (not one long stroke) because an inline link that wraps needs
 * a stroke under every line fragment; the tile starts and ends on the line, so
 * the repeats join. Seeded by the link so neighbours don't wave in step.
 */
export function storyLinkWave(href: string): { rest: string; strong: string } {
  let hit = cache.get(href);
  if (!hit) {
    const d = penWave(WAVE_TILE, seedFromString(href));
    hit = { rest: tile(d, 0.7), strong: tile(d, 1) };
    if (cache.size > 500) cache.clear();
    cache.set(href, hit);
  }
  return hit;
}
