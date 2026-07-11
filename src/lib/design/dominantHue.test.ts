import { describe, expect, it } from 'vitest';
import { CARD_HUES, cardHueIndex, dominantHue, nearestCardHue, rgbToOklch } from './dominantHue';

/** Build an RGBA buffer from repeated [r,g,b,a] pixels. */
function pixels(...px: [number, number, number, number][]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(px.length * 4);
  px.forEach(([r, g, b, a], i) => buf.set([r, g, b, a], i * 4));
  return buf;
}

describe('rgbToOklch', () => {
  it('maps pure grey to ~zero chroma', () => {
    const { C } = rgbToOklch(128, 128, 128);
    expect(C).toBeLessThan(0.001);
  });

  it('maps saturated colours to their OKLCH hue regions', () => {
    // Reference hues (oklch.com): red ≈ 29°, green ≈ 142°, blue ≈ 264°.
    expect(rgbToOklch(255, 0, 0).h).toBeCloseTo(29, 0);
    expect(rgbToOklch(0, 255, 0).h).toBeCloseTo(142, 0);
    expect(rgbToOklch(0, 0, 255).h).toBeCloseTo(264, 0);
  });

  it('white is near L=1, black near L=0', () => {
    expect(rgbToOklch(255, 255, 255).L).toBeGreaterThan(0.99);
    expect(rgbToOklch(0, 0, 0).L).toBeLessThan(0.01);
  });
});

describe('dominantHue', () => {
  it('returns the hue of a solid saturated image', () => {
    const buf = pixels(...Array.from({ length: 16 }, () => [255, 0, 0, 255] as [number, number, number, number]));
    expect(dominantHue(buf)).toBeCloseTo(29, 0);
  });

  it('ignores grey, near-black, near-white and transparent pixels', () => {
    const buf = pixels(
      [128, 128, 128, 255], // grey — skipped
      [2, 2, 4, 255],       // near-black — skipped
      [254, 254, 253, 255], // near-white — skipped
      [255, 0, 0, 10],      // transparent red — skipped
      [0, 0, 255, 255],     // the only vote
    );
    expect(dominantHue(buf)).toBeCloseTo(264, 0);
  });

  it('weights votes by chroma so the saturated subject wins over a washed background', () => {
    // Many pale-blue pixels vs a few fully saturated reds.
    const pale: [number, number, number, number] = [200, 210, 230, 255];
    const red: [number, number, number, number] = [220, 40, 30, 255];
    const buf = pixels(...Array(12).fill(pale), ...Array(4).fill(red));
    const h = dominantHue(buf)!;
    // Should land near red (~25–35°), not near the pale blue (~260°).
    expect(h).toBeLessThan(60);
  });

  it('returns null for an achromatic image', () => {
    const buf = pixels([255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]);
    expect(dominantHue(buf)).toBeNull();
  });
});

describe('nearestCardHue', () => {
  it('snaps to the closest designed family, wrapping around 360', () => {
    expect(nearestCardHue(60)).toBe(55);
    expect(nearestCardHue(300)).toBe(290);
    expect(nearestCardHue(150)).toBe(140);
    expect(nearestCardHue(0)).toBe(18); // 0 is 18° from 18, 55° from 55
    expect(nearestCardHue(350)).toBe(18); // wraps: 28° from 18, 60° from 290
    expect(nearestCardHue(230)).toBe(215);
  });

  it('every snapped value is a palette member with a valid index', () => {
    for (let h = 0; h < 360; h += 7) {
      const snapped = nearestCardHue(h);
      expect(CARD_HUES).toContain(snapped);
      expect(cardHueIndex(snapped)).toBeGreaterThanOrEqual(0);
    }
  });
});
