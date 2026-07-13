import { describe, expect, it } from 'vitest';
import { wobTabRect } from './wobTabRect';

describe('wobTabRect', () => {
  it('is deterministic for the same seed (SSR/CSR hydration parity)', () => {
    const a = wobTabRect(232, 178, 12, 118, 30, 42);
    const b = wobTabRect(232, 178, 12, 118, 30, 42);
    expect(a).toBe(b);
  });

  it('varies with the seed', () => {
    const a = wobTabRect(232, 178, 12, 118, 30, 1);
    const b = wobTabRect(232, 178, 12, 118, 30, 2);
    expect(a).not.toBe(b);
  });

  it('is a single closed path spanning the tab bump and the card', () => {
    const d = wobTabRect(232, 178, 12, 118, 30, 7);
    expect(d.startsWith('M ')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
    // One subpath only — the tab is drawn with the border, not stacked on it.
    expect(d.match(/M /g)).toHaveLength(1);
    // Reaches the tab's top (y=0 territory) and the card's bottom (y≈H+tabH).
    const ys = [...d.matchAll(/,(-?\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeLessThan(4);
    expect(Math.max(...ys)).toBeGreaterThan(200);
  });

  it('clamps a tab that starts inside the corner arc onto the straight top edge', () => {
    // tabX=0 would put the tab's left base inside the card's top-left corner
    // arc (R=18), making the outline double back on itself at the joint. The
    // clamp must keep every point of the tab (above the card's top edge at
    // y=30) to the right of the corner arc's straight-edge start.
    const d = wobTabRect(232, 178, 0, 118, 30, 42);
    const pts = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
    const tabPts = pts.filter((p) => p.y < 28);
    expect(tabPts.length).toBeGreaterThan(0);
    expect(Math.min(...tabPts.map((p) => p.x))).toBeGreaterThan(5);
  });
});
