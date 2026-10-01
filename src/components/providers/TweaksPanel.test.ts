// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TWEAK_DEFAULTS, applyTweaks } from './TweaksPanel';

const read = (p: string) => readFileSync(resolve(__dirname, '../../..', p), 'utf8');
const tokens = read('src/styles/tokens.css');
const fonts = read('src/styles/fonts.ts');

/** A custom property's declared value in tokens.css. */
function token(name: string): string {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`${name} not in tokens.css`);
  return m[1].trim();
}

const fontVariables = [...fonts.matchAll(/variable: '(--[\w-]+)'/g)].map((m) => m[1]);

afterEach(() => {
  document.documentElement.removeAttribute('style');
  localStorage.clear();
});

describe('the heading-font tweak and the self-hosted faces', () => {
  it('declares a variable for each of the four faces', () => {
    expect(fontVariables).toEqual(['--font-playfair', '--font-dm-sans', '--font-noto-serif-tc', '--font-noto-sans-tc']);
  });

  it('builds the heading and body stacks from those variables', () => {
    for (const v of fontVariables) expect(tokens).toContain(`var(${v},`);
  });

  // The provider applies the saved tweaks on every page load, so its default
  // heading must be the token itself — anything else (say, family names the
  // page no longer defines) silently replaces the site's heading face.
  it('leaves the default heading exactly as tokens.css declares it', () => {
    applyTweaks({ ...TWEAK_DEFAULTS });
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-heading'));
  });

  it('keeps the Chinese fallback of the handwritten heading on the self-hosted face', () => {
    applyTweaks({ ...TWEAK_DEFAULTS, fontFamily: 'handwritten' });
    expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-handwritten'));
  });
});
