import { describe, expect, it } from 'vitest';
import {
  containingGroupId,
  dragMembership,
  fitCamera,
  MAX_SCALE,
  MIN_SCALE,
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

describe('containingGroupId', () => {
  const groups = [
    { id: 'big', x: 0, y: 0, w: 1000, h: 800 },
    { id: 'inner', x: 100, y: 100, w: 300, h: 200 },
  ];

  it('returns null outside every group', () => {
    expect(containingGroupId({ x: -50, y: -50 }, groups)).toBeNull();
  });

  it('prefers the tightest containing region when groups overlap', () => {
    expect(containingGroupId({ x: 200, y: 150 }, groups)).toBe('inner');
    expect(containingGroupId({ x: 700, y: 500 }, groups)).toBe('big');
  });
});

describe('dragMembership', () => {
  const groups = [
    { id: 'g1', x: 0, y: 0, w: 600, h: 400 },
    { id: 'inner', x: 50, y: 50, w: 300, h: 300 },
  ];
  const node = (x: number, y: number) => ({ x, y, w: 224, h: 136 });

  it('files an unfiled card only when it is fully inside a region', () => {
    // Half-overlapping the boundary → still free.
    expect(dragMembership(node(-100, 100), null, groups)).toBeNull();
    // Fully inside → adopted, tightest region wins.
    expect(dragMembership(node(60, 60), null, groups)).toBe('inner');
    expect(dragMembership(node(360, 200), null, groups)).toBe('g1');
  });

  it('keeps a filed card while any part still overlaps its region', () => {
    // Sticking out past the right edge but still overlapping → stays (clipped).
    expect(dragMembership(node(500, 100), 'g1', groups)).toBe('g1');
    // Fully beyond the boundary → released.
    expect(dragMembership(node(700, 100), 'g1', groups)).toBeNull();
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
