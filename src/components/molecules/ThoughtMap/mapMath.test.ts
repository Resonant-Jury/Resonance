import { describe, expect, it } from 'vitest';
import {
  coverage,
  fitCamera,
  majorityGroupId,
  MAX_SCALE,
  MIN_SCALE,
  rectsIntersect,
  resolveOverlap,
  screenToWorld,
  zoomAt,
  type Camera,
} from './mapMath';

describe('camera math', () => {
  const cam: Camera = { x: 40, y: -20, s: 0.5 };

  it('screenToWorld inverts the camera transform', () => {
    const w = screenToWorld(cam, 140, 80);
    expect(w.x * cam.s + cam.x).toBeCloseTo(140);
    expect(w.y * cam.s + cam.y).toBeCloseTo(80);
  });

  it('zoomAt keeps the cursor anchored to the same world point', () => {
    const before = screenToWorld(cam, 300, 200);
    const zoomed = zoomAt(cam, 300, 200, 1.3);
    const after = screenToWorld(zoomed, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.s).toBeCloseTo(0.65);
  });

  it('zoomAt clamps to the scale range', () => {
    expect(zoomAt(cam, 0, 0, 100).s).toBe(MAX_SCALE);
    expect(zoomAt(cam, 0, 0, 0.001).s).toBe(MIN_SCALE);
  });
});

describe('coverage', () => {
  const outer = { x: 0, y: 0, w: 100, h: 100 };

  it('is 1 when fully inside, 0 when fully outside', () => {
    expect(coverage({ x: 10, y: 10, w: 20, h: 20 }, outer)).toBe(1);
    expect(coverage({ x: 200, y: 0, w: 20, h: 20 }, outer)).toBe(0);
  });

  it('reports the covered fraction across a boundary', () => {
    // Left half inside, right half out.
    expect(coverage({ x: 90, y: 0, w: 20, h: 20 }, outer)).toBeCloseTo(0.5);
  });
});

describe('majorityGroupId', () => {
  const groups = [
    { id: 'g1', x: 0, y: 0, w: 600, h: 400 },
    { id: 'inner', x: 50, y: 50, w: 300, h: 300 },
  ];
  const node = (x: number, y: number) => ({ x, y, w: 224, h: 136 });

  it('files a card once more than half of it sits inside a region', () => {
    // Just over half inside past the left boundary → filed.
    expect(majorityGroupId(node(-100, 100), groups)).toBe('g1');
    // More than half outside → free.
    expect(majorityGroupId(node(-120, 100), groups)).toBeNull();
    // Exactly half is not a majority — half out means out.
    expect(majorityGroupId(node(-112, 100), groups)).toBeNull();
  });

  it('prefers the tightest region when groups overlap', () => {
    expect(majorityGroupId(node(60, 60), groups)).toBe('inner');
    expect(majorityGroupId(node(360, 200), groups)).toBe('g1');
  });

  it('releases a card once more than half slides out', () => {
    // Sticking out past the right edge but majority still inside → stays.
    expect(majorityGroupId(node(450, 100), groups)).toBe('g1');
    // Majority beyond the boundary → released, even while still overlapping.
    expect(majorityGroupId(node(520, 100), groups)).toBeNull();
  });
});

describe('resolveOverlap', () => {
  const size = { w: 224, h: 136 };
  const at = (x: number, y: number) => ({ x, y, ...size });

  it('leaves an already-clear position untouched', () => {
    const pos = resolveOverlap(at(1000, 1000), [at(0, 0)]);
    expect(pos).toEqual({ x: 1000, y: 1000 });
  });

  it('pushes a dropped card out of every obstacle (plus breathing room)', () => {
    const obstacles = [at(0, 0), at(260, 0)];
    const pos = resolveOverlap(at(40, 10), obstacles, 12);
    for (const o of obstacles) {
      expect(rectsIntersect({ ...pos, ...size }, o)).toBe(false);
    }
  });

  it('moves along the axis needing the smaller nudge', () => {
    // Slight vertical offset over an obstacle → resolves downward, keeping x.
    const pos = resolveOverlap(at(0, 120), [at(0, 0)], 12);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(148);
  });
});

describe('fitCamera', () => {
  it('frames all rects inside the viewport with padding', () => {
    const rects = [
      { x: 0, y: 0, w: 224, h: 136 },
      { x: 900, y: 600, w: 224, h: 136 },
    ];
    const cam = fitCamera(rects, 800, 500);
    for (const r of rects) {
      for (const [wx, wy] of [
        [r.x, r.y],
        [r.x + r.w, r.y + r.h],
      ]) {
        const sx = wx * cam.s + cam.x;
        const sy = wy * cam.s + cam.y;
        expect(sx).toBeGreaterThanOrEqual(0);
        expect(sx).toBeLessThanOrEqual(800);
        expect(sy).toBeGreaterThanOrEqual(0);
        expect(sy).toBeLessThanOrEqual(500);
      }
    }
    // Never zooms in past 1:1 just because content is small.
    expect(cam.s).toBeLessThanOrEqual(1);
  });

  it('handles an empty map without exploding', () => {
    const cam = fitCamera([], 800, 500);
    expect(cam.s).toBe(1);
  });
});
