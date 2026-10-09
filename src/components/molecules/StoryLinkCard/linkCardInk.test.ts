import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const tokens = read('src/styles/tokens.css');

/** An `oklch(L% C H)` token of tokens.css. */
function token(name: string): [number, number, number] {
  const m = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`).exec(tokens);
  if (!m) throw new Error(`no oklch token --${name}`);
  return [Number(m[1]) / 100, Number(m[2]), Number(m[3])];
}

/** WCAG relative luminance of an OKLCH colour (OKLab → linear sRGB, Björn Ottosson). */
function luminance([L, C, H]: [number, number, number]): number {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const [r, g, bl] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const contrast = (fg: string, bg: string) => {
  const [a, b] = [luminance(token(fg)), luminance(token(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

describe('a link card’s quiet words (description and host)', () => {
  // The muted ink is 4.3:1 on the bubbles' paper — under 4.5:1 for 13–14px
  // text. The link cards take a deeper one, the same value as the apps'.
  it('clear 4.5:1 on every paper a link card stands on', () => {
    expect(token('link-card-muted')).toEqual([0.45, 0.04, 70]);
    for (const paper of ['bubble-theirs', 'bubble-mine', 'bubble-quote']) {
      expect(contrast('link-card-muted', paper)).toBeGreaterThanOrEqual(4.5);
    }
    // What they had: below the line.
    expect(contrast('color-text-muted', 'bubble-theirs')).toBeLessThan(4.5);
  });

  it('are the link card ink in a story’s link card and a chat link’s preview', () => {
    const rule = (css: string, selector: string) =>
      new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
    const story = read('src/components/molecules/StoryLinkCard/StoryLinkCard.module.css');
    const chat = read('src/components/sections/MessagesPage/Thread.module.css');
    for (const [css, selector] of [
      [story, '.description'],
      [story, '.host'],
      [chat, '.previewDescription'],
      [chat, '.previewHost'],
    ] as const) {
      expect(rule(css, selector), selector).toMatch(/color:\s*var\(--link-card-muted\)/);
    }
  });
});
