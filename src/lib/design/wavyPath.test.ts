import { describe, it, expect } from 'vitest';
import { wavyLine, wavyVertical, wavyPoints, pointsToBezier } from './wavyPath';

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
