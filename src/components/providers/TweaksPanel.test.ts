// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TWEAK_DEFAULTS, applyTweaks, loadTweaks } from './TweaksPanel';

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

// The provider runs in the root layout, on every page: a throw there is every
// page's error screen.
describe('without site storage', () => {
  /** A browser blocking site data: reading `localStorage` itself throws. */
  function blockStorage() {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    return () => Object.defineProperty(window, 'localStorage', original);
  }

  it('applies the defaults and remembers nothing, without throwing', () => {
    const restore = blockStorage();
    try {
      expect(() => applyTweaks(loadTweaks())).not.toThrow();
      expect(loadTweaks()).toEqual(TWEAK_DEFAULTS);
      expect(document.documentElement.style.getPropertyValue('--font-heading')).toBe(token('--font-heading'));
    } finally {
      restore();
    }
  });

  it('reads what an older version saved, minus what no longer exists', () => {
    localStorage.setItem('resonance-tweaks', JSON.stringify({ accentColor: 'sage', cardDensity: 'airy', grainIntensity: 3 }));
    expect(loadTweaks()).toEqual({ accentColor: 'sage', fontFamily: 'default', grainIntensity: 3 });
    localStorage.setItem('resonance-tweaks', '"not an object"');
    expect(loadTweaks()).toEqual(TWEAK_DEFAULTS);
  });
});

// Density wrote grid-template-columns onto every [data-card-grid] at load; the
// home grid's node outlived the pre-hydration layout it was written for, and
// its masonry got an extra, empty column on a wide screen.
it('leaves the card grids their own columns', () => {
  const grid = document.createElement('div');
  grid.setAttribute('data-card-grid', '');
  document.body.appendChild(grid);
  applyTweaks({ ...TWEAK_DEFAULTS });
  expect(grid.style.gridTemplateColumns).toBe('');
  grid.remove();
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
