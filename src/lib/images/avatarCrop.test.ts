import { describe, expect, it } from 'vitest';
import {
  CROP_START,
  clampView,
  cropOutputSide,
  cropRect,
  cropSourceSize,
  cropStage,
  panView,
  zoomView,
  type CropRect,
} from './avatarCrop';

// design-b.md §B7's shared table — the apps' ports run the same numbers.
const wide = { width: 4000, height: 3000 };
const tall = { width: 1000, height: 2000 };

function expectRect(r: CropRect, x: number, y: number, side: number) {
  expect(r.x).toBeCloseTo(x, 6);
  expect(r.y).toBeCloseTo(y, 6);
  expect(r.side).toBeCloseTo(side, 6);
}

describe('framing a profile photo', () => {
  it('starts unzoomed and centred, the short side just covering the mask', () => {
    expectRect(cropRect(wide, 272, CROP_START), 500, 0, 3000);
    expectRect(cropRect(tall, 250, CROP_START), 0, 500, 1000);
  });

  it('zooms about the mask’s centre', () => {
    expectRect(cropRect(wide, 272, zoomView(wide, 272, CROP_START, 2)), 1250, 750, 1500);
    expectRect(cropRect(tall, 250, zoomView(tall, 250, CROP_START, 4)), 375, 875, 250);
  });

  it('never lets the mask past the picture’s edge', () => {
    expectRect(cropRect(wide, 272, panView(wide, 272, CROP_START, 100, 0)), 0, 0, 3000);
    expectRect(cropRect(wide, 272, panView(wide, 272, CROP_START, -100, 0)), 1000, 0, 3000);
    // The short side has no room at all unzoomed.
    expect(panView(wide, 272, CROP_START, 0, 50).oy).toBe(0);
    // However it is dragged, the square stays inside the picture.
    let v = zoomView(wide, 272, CROP_START, 3);
    for (const [dx, dy] of [[900, -900], [-2000, 40], [5, 5000]]) {
      v = panView(wide, 272, v, dx, dy);
      const r = cropRect(wide, 272, v);
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.side).toBeLessThanOrEqual(4000 + 1e-9);
      expect(r.y + r.side).toBeLessThanOrEqual(3000 + 1e-9);
    }
  });

  it('keeps the point under the fingers or the pointer where it is while zooming', () => {
    const d = 272;
    const anchor = { x: 60, y: -40 };
    const before = zoomView(wide, d, CROP_START, 2);
    const after = zoomView(wide, d, before, 3, anchor);
    // The image point under the anchor: (anchor − o) / s, the same before and after.
    const s = (v: typeof before) => (d / 3000) * v.z;
    expect((anchor.x - after.ox) / s(after)).toBeCloseTo((anchor.x - before.ox) / s(before), 6);
    expect((anchor.y - after.oy) / s(after)).toBeCloseTo((anchor.y - before.oy) / s(before), 6);
  });

  it('holds the zoom between 1 and 4, and zooming out pulls the picture back over the mask', () => {
    expect(zoomView(wide, 272, CROP_START, 9).z).toBe(4);
    expect(zoomView(wide, 272, CROP_START, 0.2).z).toBe(1);
    const far = panView(wide, 272, zoomView(wide, 272, CROP_START, 4), 1e6, 1e6);
    const back = zoomView(wide, 272, far, 1);
    expect(back).toEqual(clampView(wide, 272, { z: 1, ox: back.ox, oy: back.oy }));
    expectRect(cropRect(wide, 272, back), 0, 0, 3000);
  });

  it('sends a square of the crop’s own size, within 256…512', () => {
    expect(cropOutputSide(3000)).toBe(512);
    expect(cropOutputSide(300.4)).toBe(300);
    expect(cropOutputSide(120)).toBe(256);
  });

  it('decodes a large picture to 2048 on its long side, a small one as it is', () => {
    expect(cropSourceSize(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(cropSourceSize(3000, 6000)).toEqual({ width: 1024, height: 2048 });
    expect(cropSourceSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('sizes the stage to the room, at most 320, the mask 24 inside it all round', () => {
    expect(cropStage(352)).toEqual({ stage: 320, mask: 272 });
    expect(cropStage(295.6)).toEqual({ stage: 295, mask: 247 });
  });
});
