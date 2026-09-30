import { describe, it, expect } from 'vitest';
import { penWave, penWavePoints, wavyLine, wavyVertical, wavyPoints, pointsToBezier } from './wavyPath';

// Wavy paths are used as dividers and section edges. The contract that matters
// downstream: deterministic per seed, endpoints pinned to the axis (so tiles
// line up), and well-formed bezier output.
describe('wavyLine', () => {
  it('starts and ends on the baseline (y=0) so dividers connect cleanly', () => {
    const d = wavyLine(100, 3, 4, 6);
    expect(d.startsWith('M 0,0')).toBe(true);
    // Final command lands on x=W, y=0.
    expect(d.trim().endsWith('100,0')).toBe(true);
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(wavyLine(100, 7)).toBe(wavyLine(100, 7));
    expect(wavyLine(100, 7)).not.toBe(wavyLine(100, 8));
  });
});

describe('wavyVertical', () => {
  it('pins both endpoints to x=0 and spans the full height', () => {
    const d = wavyVertical(80, 2, 3, 5);
    expect(d.startsWith('M 0,0')).toBe(true);
    expect(d.trim().endsWith('0,80')).toBe(true);
  });
});

describe('wavyPoints + pointsToBezier', () => {
  it('produces steps+1 points with pinned y endpoints', () => {
    const pts = wavyPoints(120, 10, 5, 1, 4);
    expect(pts).toHaveLength(5);
    expect(pts[0][1]).toBe(10); // first y pinned to y0
    expect(pts[pts.length - 1][1]).toBe(10); // last y pinned to y0
  });

  it('serialises points into a moveto-prefixed cubic path', () => {
    const pts = wavyPoints(120, 10, 5, 1, 4);
    const d = pointsToBezier(pts);
    expect(d.startsWith('M ')).toBe(true);
    expect(d).toContain('C');
  });
});

describe('penWave', () => {
  it('draws the same pen line for the same seed, another for another', () => {
    expect(penWave(120, 17)).toBe(penWave(120, 17));
    expect(penWave(120, 17)).not.toBe(penWave(120, 18));
  });

  it('starts and settles on the line at both ends, even when very short', () => {
    for (const w of [4, 8, 120]) {
      const d = penWave(w, 3);
      expect(d.startsWith('M 0,0')).toBe(true);
      expect(d.endsWith(`${w},0`)).toBe(true);
    }
  });

  it('makes a crest every ~4.5px, alternating up and down', () => {
    const pts = penWavePoints(90, 5, 1.2, 4.5);
    expect(pts).toHaveLength(21);
    const interior = pts.slice(1, -1);
    interior.forEach(([, y], i) => {
      expect(Math.sign(y)).toBe(i % 2 === 0 ? -1 : 1);
      expect(Math.abs(y)).toBeGreaterThanOrEqual(1.2 * 0.65 - 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(1.2 * 1.35 + 1e-9);
    });
  });
});
