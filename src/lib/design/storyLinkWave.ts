import { penWaveTile } from './wavyPath';
import { seedFromString } from './prng';
import { INK } from './strokes';

/** Width of one repeating tile: eight crests at the pen's 4.5px rhythm. */
export const WAVE_TILE = 36;
/**
 * The tile's height, centred on the pen's line: the crests (at most
 * 1.35 × 1.2 = 1.62px off the line) plus half the INK stroke fit inside it,
 * so nothing of the wave is ever cut at the tile's edge.
 */
export const WAVE_TILE_H = 6;
/** --color-terracotta, as sRGB: a data URI can't read the page's CSS variables. */
const TERRACOTTA = 'rgb(201,103,54)';

/**
 * How far under the baseline the wave's centre runs, in em of the link's
 * text — the depth every platform draws a story link's wave at (the apps
 * stroke `penWave` there; the web places its tiles so, see the readers'
 * CSS). Clear of Chinese glyphs, with Latin descenders just dipping into the
 * up crests.
 */
export const WAVE_DEPTH_EM = 0.29;

export interface StoryLinkWave {
  /** The tile at rest (~0.7 opacity) and pointed at or pressed (full), as CSS `url()`s. */
  rest: string;
  strong: string;
  /** The tile's `background-size`. */
  size: string;
}

const cache = new Map<string, StoryLinkWave>();

function tile(d: string, opacity: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WAVE_TILE}" height="${WAVE_TILE_H}" viewBox="0 ${-WAVE_TILE_H / 2} ${WAVE_TILE} ${WAVE_TILE_H}">` +
    `<path d="${d}" fill="none" stroke="${TERRACOTTA}" stroke-opacity="${opacity}" stroke-width="${INK}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/**
 * The pen-wave underline of a link inside story text, as CSS values for a
 * repeating background (`--wave`, `--wave-strong`, `--wave-size`). A tile
 * (not one long stroke) because an inline link that wraps needs a stroke
 * under every line fragment; the tile starts and ends on the same crest, so
 * the repeats join without a step. Seeded by the link so neighbours don't
 * wave in step.
 */
export function storyLinkWave(href: string): StoryLinkWave {
  let hit = cache.get(href);
  if (!hit) {
    const d = penWaveTile(WAVE_TILE, seedFromString(href));
    hit = { rest: tile(d, 0.7), strong: tile(d, 1), size: `${WAVE_TILE}px ${WAVE_TILE_H}px` };
    if (cache.size > 500) cache.clear();
    cache.set(href, hit);
  }
  return hit;
}

/** The three custom properties a link (or a whole editor) wears its wave through. */
export function storyLinkWaveVars(href: string): Record<'--wave' | '--wave-strong' | '--wave-size', string> {
  const wave = storyLinkWave(href);
  return { '--wave': wave.rest, '--wave-strong': wave.strong, '--wave-size': wave.size };
}

/** {@link storyLinkWaveVars} as an inline `style` attribute's text, for a surface styled outside React (the editors). */
export function storyLinkWaveStyle(href: string): string {
  return Object.entries(storyLinkWaveVars(href))
    .map(([name, value]) => `${name}: ${value}`)
    .join('; ');
}
