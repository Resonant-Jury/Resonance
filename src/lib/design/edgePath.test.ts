import { describe, expect, it } from 'vitest';
import { arrowHeadPath, organicEdgePath, rectAnchor, type RectLike } from './edgePath';

const A: RectLike = { x: 0, y: 0, w: 220, h: 130 };

describe('rectAnchor', () => {
  it('picks the side facing the target by dominant axis', () => {
    expect(rectAnchor(A, { x: 600, y: 65 })).toMatchObject({ x: 220, nx: 1, ny: 0 });
    expect(rectAnchor(A, { x: -400, y: 65 })).toMatchObject({ x: 0, nx: -1, ny: 0 });
    expect(rectAnchor(A, { x: 110, y: 800 })).toMatchObject({ y: 130, nx: 0, ny: 1 });
    expect(rectAnchor(A, { x: 110, y: -500 })).toMatchObject({ y: 0, nx: 0, ny: -1 });
  });

  it('slides along the side toward the target but stays inside the edge', () => {
    const high = rectAnchor(A, { x: 600, y: -300 });
    const low = rectAnchor(A, { x: 600, y: 430 });
    expect(high.x).toBe(220);
    expect(low.x).toBe(220);
    expect(high.y).toBeLessThan(low.y);
    expect(high.y).toBeGreaterThanOrEqual(14);
    expect(low.y).toBeLessThanOrEqual(130 - 14);
  });
});

describe('organicEdgePath', () => {
  const B: RectLike = { x: 500, y: 300, w: 220, h: 130 };

  it('is deterministic for the same seed (SSR/CSR parity)', () => {
    const a = organicEdgePath(A, B, 42);
    const b = organicEdgePath(A, B, 42);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    expect(organicEdgePath(A, B, 1).d).not.toBe(organicEdgePath(A, B, 2).d);
  });

  it('starts and ends on the facing rect borders', () => {
    const g = organicEdgePath(A, B, 7);
    expect(g.d.startsWith(`M ${g.start.x},${g.start.y}`)).toBe(true);
    expect(g.d.endsWith(`${g.end.x},${g.end.y}`)).toBe(true);
    // B sits down-right of A with a dominant horizontal gap → right side of A,
    // left side of B.
    expect(g.start.x).toBe(A.x + A.w);
    expect(g.end.x).toBe(B.x);
  });

  it('places the label midpoint between the two cards', () => {
    const g = organicEdgePath(A, B, 7);
    expect(g.mid.x).toBeGreaterThan(A.x + A.w);
    expect(g.mid.x).toBeLessThan(B.x);
  });
});

describe('arrowHeadPath', () => {
  it('is deterministic and anchored at the tip', () => {
    const p1 = arrowHeadPath({ x: 100, y: 50 }, 0, 12, 5);
    const p2 = arrowHeadPath({ x: 100, y: 50 }, 0, 12, 5);
    expect(p1).toBe(p2);
    expect(p1.startsWith('M 100,50')).toBe(true);
  });

  it('sweeps both wings back from the travel direction', () => {
    // Arrow arriving travelling +x: both wing endpoints must land left of the tip.
    const d = arrowHeadPath({ x: 100, y: 50 }, 0, 12, 5);
    const xs = [...d.matchAll(/Q [\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+)/g)].map((m) => Number(m[1]));
    expect(xs).toHaveLength(2);
    for (const x of xs) expect(x).toBeLessThan(100);
  });
});
