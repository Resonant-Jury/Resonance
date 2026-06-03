import { describe, it, expect } from 'vitest';
import { wobOpenTop } from './wobOpenRect';

// wobOpenTop draws the dropdown panel border: left + bottom + right edges only,
// with rounded bottom corners and an open (unstroked) top. It must be
// deterministic per seed and never close the path.
const PATH = /^M [\d.,\s-]+/;

describe('wobOpenTop', () => {
  it('returns an open path (no trailing Z) starting at the top-left', () => {
    const d = wobOpenTop(240, 180, 16, 1);
    expect(d).toMatch(PATH);
    expect(d.trim().startsWith('M 0,0')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(false);
    expect(d).toContain('C');
  });

  it('ends at the top-right corner so the seam meets the trigger box', () => {
    const W = 240;
    const d = wobOpenTop(W, 180, 16, 7);
    // Final coordinate pair should land on (W, 0).
    const last = d.trim().split('C').pop()!.trim().split(/\s+/).pop()!;
    expect(last).toBe(`${W},0`);
  });

  it('is deterministic for a given seed', () => {
    expect(wobOpenTop(240, 180, 16, 42)).toBe(wobOpenTop(240, 180, 16, 42));
  });

  it('changes the path when the seed changes', () => {
    expect(wobOpenTop(240, 180, 16, 1)).not.toBe(wobOpenTop(240, 180, 16, 2));
  });

  it('emits only finite numeric coordinates', () => {
    const d = wobOpenTop(300, 220, 18, 5, undefined, {
      curve: 1.4,
      segmentsH: [3, 5],
      segmentsV: 3,
    });
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isFinite(Number(n))).toBe(true);
    }
  });
});
