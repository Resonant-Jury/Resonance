import { describe, it, expect } from 'vitest';
import { wobLoop } from './wobLoop';

// wobLoop generates the SketchLoader's two-lap pen loop. It must be
// deterministic per seed (SSR/CSR parity) and always emit ONE closed subpath —
// a second moveto would make dash patterns restart mid-stroke in Chromium,
// which is exactly the artifact it exists to avoid.
describe('wobLoop', () => {
  it('returns a single closed subpath (one moveto, ends with Z)', () => {
    const d = wobLoop(32, 32, 22, 17, 7);
    expect(d).toMatch(/^M [\d.,\s-]+/);
    expect(d.trim().endsWith('Z')).toBe(true);
    expect(d).toContain('C');
    expect(d.match(/M /g)).toHaveLength(1);
  });

  it('is deterministic for a given seed', () => {
    expect(wobLoop(32, 32, 22, 17, 99)).toBe(wobLoop(32, 32, 22, 17, 99));
  });

  it('changes the path when the seed changes', () => {
    expect(wobLoop(32, 32, 22, 17, 1)).not.toBe(wobLoop(32, 32, 22, 17, 2));
  });

  it('emits only finite numeric coordinates (no NaN/Infinity leaking in)', () => {
    const d = wobLoop(50, 50, 30, 20, 5, { segments: 9, mag: 2, cpJitter: 0.8, blend: 0.1 });
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const n of numbers) {
      expect(Number.isFinite(Number(n))).toBe(true);
    }
  });

  it('covers both laps: twice the bezier segments of one lap', () => {
    const d = wobLoop(32, 32, 22, 17, 3, { segments: 9 });
    expect(d.match(/C /g)).toHaveLength(18);
  });
});
