import { describe, expect, it } from 'vitest';
import { SB, brushSpine, scrollTopForThumb, thumbGeometry } from './scrollbarGeometry';

const m = (scrollTop: number, scrollHeight = 1000, clientHeight = 400) => ({ scrollTop, scrollHeight, clientHeight });

describe('thumbGeometry', () => {
  it('draws no bar for nothing to scroll, a few px of overshoot, or before anything is measured', () => {
    expect(thumbGeometry(m(0, 400, 400), 392)).toBeNull();
    expect(thumbGeometry(m(0, 406, 400), 392)).toBeNull();
    expect(thumbGeometry(m(0, 407, 400), 392)).not.toBeNull();
    expect(thumbGeometry(m(0), 0)).toBeNull();
    expect(thumbGeometry(m(0, 1000, 0), 392)).toBeNull();
  });

  it('is as long as the visible share of the content, in whole px, never under the minimum nor over the track', () => {
    expect(thumbGeometry(m(0), 392)!.h).toBe(157); // 392 × 400 / 1000 = 156.8
    expect(thumbGeometry(m(0, 100_000), 392)!.h).toBe(SB.min);
    expect(thumbGeometry(m(0, 1000, 400), 20)!.h).toBe(20);
  });

  it('stands as far down the track as the list is scrolled: top, halfway, the end, and clamped past them', () => {
    const at = (top: number) => thumbGeometry(m(top), 392)!;
    expect(at(0).top).toBe(0);
    expect(at(300).top).toBeCloseTo((392 - 157) / 2);
    expect(at(600).top).toBeCloseTo(392 - 157);
    expect(at(-40).top).toBe(0);
    expect(at(900).top).toBeCloseTo(392 - 157);
    expect(at(600).max).toBe(600);
  });
});

describe('scrollTopForThumb', () => {
  it('is the inverse of thumbGeometry: a thumb moved to where a scroll put it asks for that scroll', () => {
    for (const scrollTop of [0, 120, 300, 599, 600]) {
      const g = thumbGeometry(m(scrollTop), 392)!;
      expect(scrollTopForThumb(g.top, 392, g.h, g.max)).toBeCloseTo(scrollTop);
    }
  });

  it('clamps to the track’s ends, and asks for nothing when the thumb fills the track', () => {
    expect(scrollTopForThumb(-30, 392, 157, 600)).toBe(0);
    expect(scrollTopForThumb(1000, 392, 157, 600)).toBe(600);
    expect(scrollTopForThumb(10, 100, 100, 600)).toBe(0);
  });

  it('keeps a grab’s offset: dragging 10px moves the list by 10px of track, wherever the thumb was taken', () => {
    const g = thumbGeometry(m(150), 392)!;
    const grab = 40; // taken 40px below its top
    const pointer = g.top + grab;
    // Not moved yet: no jump.
    expect(scrollTopForThumb(pointer - grab, 392, g.h, g.max)).toBeCloseTo(150);
    // 10px down the track.
    expect(scrollTopForThumb(pointer + 10 - grab, 392, g.h, g.max)).toBeCloseTo(150 + (10 / (392 - g.h)) * 600);
  });
});

describe('brushSpine', () => {
  it('is the same stroke for the same seed and length (the server’s and the browser’s), another for another seed', () => {
    expect(brushSpine(120, 31)).toBe(brushSpine(120, 31));
    expect(brushSpine(120, 31)).not.toBe(brushSpine(120, 61));
  });

  it('runs from 5px under its top to 5px over its foot — room for a 10px stroke’s round ends — bowed under a pixel at its middle', () => {
    for (const seed of [1, 31, 61, 71]) {
      const d = brushSpine(120, seed);
      const nums = d.match(/-?[\d.]+/g)!.map(Number);
      expect(d.startsWith(`M 0,${SB.active / 2} `)).toBe(true);
      expect(d.endsWith(` 0,${120 - SB.active / 2}`)).toBe(true);
      const xs = nums.filter((_, i) => i % 2 === 0);
      const bow = Math.max(...xs.map(Math.abs));
      expect(bow).toBeGreaterThanOrEqual(0.6);
      expect(bow).toBeLessThanOrEqual(0.9);
      // Its middle point is the bow, halfway down.
      expect(d).toContain(`,60 C `);
    }
  });

  it('stays a single bowed stroke on the shortest thumb', () => {
    const d = brushSpine(SB.min, 7);
    expect(d.startsWith('M 0,5 ')).toBe(true);
    expect(d.endsWith(` 0,${SB.min - 5}`)).toBe(true);
  });
});
