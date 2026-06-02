import { describe, it, expect } from 'vitest';
import { wobRect } from './wobRect';

// wobRect generates the wobbly card/border outlines. It must be deterministic
// per seed (SSR/CSR parity) and always emit a well-formed, closed SVG path.
const PATH = /^M [\d.,\s-]+/;

describe('wobRect', () => {
  it('returns a closed path that starts with a moveto and ends with Z', () => {
    const d = wobRect(200, 120, 16, 1);
    expect(d).toMatch(PATH);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d).toContain('C'); // contains cubic bezier segments
  });

  it('is deterministic for a given seed', () => {
    expect(wobRect(200, 120, 16, 99)).toBe(wobRect(200, 120, 16, 99));
  });

  it('changes the path when the seed changes', () => {
    expect(wobRect(200, 120, 16, 1)).not.toBe(wobRect(200, 120, 16, 2));
  });

  it('emits only finite numeric coordinates (no NaN/Infinity leaking in)', () => {
    const d = wobRect(300, 80, 24, 5, undefined, {
      curve: 1.5,
      cornerJitter: 1,
      cornerOffset: 4,
      segmentsH: [2, 5],
      segmentsV: 3,
    });
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isFinite(Number(n))).toBe(true);
    }
  });

  it('produces more segments for a higher segment count', () => {
    const few = wobRect(400, 400, 20, 3, 6, { segmentsH: 2, segmentsV: 2 });
    const many = wobRect(400, 400, 20, 3, 6, { segmentsH: 8, segmentsV: 8 });
    const count = (s: string) => (s.match(/C/g) ?? []).length;
    expect(count(many)).toBeGreaterThan(count(few));
  });
});
