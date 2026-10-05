import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { INK } from './strokes';
import { WAVE_DEPTH_EM, WAVE_TILE, WAVE_TILE_H, storyLinkWave, storyLinkWaveStyle, storyLinkWaveVars } from './storyLinkWave';
import { penWaveTilePoints } from './wavyPath';
import { seedFromString } from './prng';

/** The SVG inside a tile's `url("data:…")`. */
const svgOf = (css: string) => decodeURIComponent(css.slice('url("data:image/svg+xml,'.length, -'")'.length));

describe('storyLinkWave', () => {
  it('draws the whole stroke inside its tile, so no crest is ever cut at the tile’s edge', () => {
    for (const href of ['https://example.com/a', 'https://example.com/b', 'editor', '']) {
      const svg = svgOf(storyLinkWave(href).rest);
      expect(svg).toContain(`width="${WAVE_TILE}" height="${WAVE_TILE_H}" viewBox="0 ${-WAVE_TILE_H / 2} ${WAVE_TILE} ${WAVE_TILE_H}"`);
      expect(svg).toContain(`stroke-width="${INK}"`);
      // Its farthest crest (at most 1.35 × 1.2px off the line), plus half the pen, stays inside the half tile.
      const ys = penWaveTilePoints(WAVE_TILE, seedFromString(href)).map(([, y]) => Math.abs(y));
      expect(Math.max(...ys)).toBeLessThanOrEqual(1.62 + 1e-9);
      expect(Math.max(...ys) + INK / 2).toBeLessThanOrEqual(WAVE_TILE_H / 2);
    }
  });

  it('joins tile to tile on a crest: the path starts and ends at the same height', () => {
    const svg = svgOf(storyLinkWave('https://example.com/seam').rest);
    const d = svg.match(/ d="([^"]+)"/)![1];
    const start = d.match(/^M ([\d.-]+),([\d.-]+)/)!;
    const end = d.match(/ ([\d.-]+),([\d.-]+)$/)!;
    expect(Number(start[1])).toBe(0);
    expect(Number(end[1])).toBe(WAVE_TILE);
    expect(Number(end[2])).toBe(Number(start[2]));
    expect(Number(start[2])).toBeGreaterThan(0);
  });

  it('rests at 0.7 and strengthens to full ink when pointed at, the same wave either way', () => {
    const wave = storyLinkWave('https://example.com/x');
    expect(svgOf(wave.rest)).toContain('stroke-opacity="0.7"');
    expect(svgOf(wave.strong)).toContain('stroke-opacity="1"');
    expect(svgOf(wave.rest).replace('stroke-opacity="0.7"', '')).toBe(svgOf(wave.strong).replace('stroke-opacity="1"', ''));
  });

  it('hands over the tile’s size with the tile, as custom properties and as a style attribute', () => {
    const vars = storyLinkWaveVars('https://example.com/x');
    expect(vars['--wave-size']).toBe(`${WAVE_TILE}px ${WAVE_TILE_H}px`);
    expect(vars['--wave']).toBe(storyLinkWave('https://example.com/x').rest);
    const style = storyLinkWaveStyle('editor');
    expect(style).toContain(`--wave-size: ${WAVE_TILE}px ${WAVE_TILE_H}px`);
    expect(style).toContain('--wave: url("data:image/svg+xml,');
    expect(style).toContain('--wave-strong: url("data:image/svg+xml,');
  });
});

// jsdom lays nothing out, so the placement lives in the stylesheets: every surface that shows a story's links
// (the reader, the web editor, the apps' editor island) draws the wave the same way.
describe('the wave’s placement in each stylesheet', () => {
  const root = resolve(__dirname, '../../..');
  const sheets = {
    reader: ['src/components/molecules/CardDetail/StoryMarkdown.module.css', '.prose .link {'],
    editor: ['src/components/molecules/MarkdownEditor/MarkdownEditor.module.css', '.content a {'],
    island: ['native/editor/src/island.css', '.ProseMirror a {'],
  } as const;

  it.each(Object.entries(sheets))('%s: the tile sits inside the link’s box, its centre WAVE_DEPTH_EM under the baseline', (_name, [file, selector]) => {
    const css = readFileSync(resolve(root, file), 'utf8');
    const at = css.indexOf(selector);
    expect(at).toBeGreaterThanOrEqual(0);
    const rule = css.slice(at, css.indexOf('}', at));
    expect(rule).toMatch(/text-decoration:\s*none/);
    expect(rule).toMatch(/background-image:\s*var\(--wave\)/);
    expect(rule).toMatch(/background-size:\s*var\(--wave-size\)/);
    // On the box's bottom edge, never past it: an inline box paints its background only inside itself.
    expect(rule).toMatch(/background-position:\s*0 100%/);
    expect(rule).toContain(`padding-bottom: calc(${WAVE_DEPTH_EM}em + ${WAVE_TILE_H / 2}px - round(0.31em, 1px))`);
    expect(css).toContain(`padding-bottom: calc(${WAVE_DEPTH_EM}em + ${WAVE_TILE_H / 2}px - round(0.251em, 1px))`);
  });
});
