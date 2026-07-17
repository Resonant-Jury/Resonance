import type { RectLike } from '@/lib/design/edgePath';

/**
 * Pure camera / layout math for the thought-map canvas. World coordinates are
 * what Firestore stores; the camera maps them onto the viewport via
 * `screen = world * s + (x, y)`.
 */

export const NODE_W = 232;
export const NODE_H = 178;

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 2;

export interface Camera {
  x: number;
  y: number;
  s: number;
}

export interface GroupRect extends RectLike {
  id: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function screenToWorld(cam: Camera, px: number, py: number): { x: number; y: number } {
  return { x: (px - cam.x) / cam.s, y: (py - cam.y) / cam.s };
}

/** Zoom by `factor` keeping the screen point (px, py) fixed under the cursor. */
export function zoomAt(cam: Camera, px: number, py: number, factor: number): Camera {
  const s = clamp(cam.s * factor, MIN_SCALE, MAX_SCALE);
  const k = s / cam.s;
  return { s, x: px - (px - cam.x) * k, y: py - (py - cam.y) * k };
}

export function nodeRect(n: { x: number; y: number }): RectLike {
  return { x: n.x, y: n.y, w: NODE_W, h: NODE_H };
}

export function rectContains(r: RectLike, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Grow a rect by `pad` on every side (used for "near a card" hit zones). */
export function inflateRect(r: RectLike, pad: number): RectLike {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/** Fraction of `rect`'s area covered by `outer` (0..1). */
export function coverage(rect: RectLike, outer: RectLike): number {
  const ox = Math.min(rect.x + rect.w, outer.x + outer.w) - Math.max(rect.x, outer.x);
  const oy = Math.min(rect.y + rect.h, outer.y + outer.h) - Math.max(rect.y, outer.y);
  if (ox <= 0 || oy <= 0) return 0;
  return (ox * oy) / (rect.w * rect.h);
}

/**
 * Majority-rule membership: a card belongs to the region covering more than
 * half of it — the moment half slides out, it's out (and un-clips). Symmetric
 * on the way in, so a card straddling the boundary never gets stuck filed but
 * mostly hidden. Overlapping regions resolve to the tightest one.
 */
export function majorityGroupId(rect: RectLike, groups: GroupRect[]): string | null {
  let best: GroupRect | null = null;
  for (const g of groups) {
    if (coverage(rect, g) <= 0.5) continue;
    if (!best || g.w * g.h < best.w * best.h) best = g;
  }
  return best?.id ?? null;
}

/**
 * Nudge `rect` to the nearest clear spot: cards are translucent, so resting
 * overlap is never allowed. Every obstacle still intersecting (inflated by
 * `gap` breathing room) pushes the rect out along whichever axis needs the
 * smaller move, iterating until the position settles.
 */
export function resolveOverlap(
  rect: RectLike,
  obstacles: RectLike[],
  gap = 12,
): { x: number; y: number } {
  let x = rect.x;
  let y = rect.y;
  for (let iter = 0; iter < 16; iter++) {
    let moved = false;
    for (const o of obstacles) {
      const ox = Math.min(x + rect.w, o.x + o.w + gap) - Math.max(x, o.x - gap);
      const oy = Math.min(y + rect.h, o.y + o.h + gap) - Math.max(y, o.y - gap);
      if (ox <= 0 || oy <= 0) continue;
      if (ox <= oy) {
        x += x + rect.w / 2 >= o.x + o.w / 2 ? ox : -ox;
      } else {
        y += y + rect.h / 2 >= o.y + o.h / 2 ? oy : -oy;
      }
      moved = true;
    }
    if (!moved) return { x, y };
  }
  return { x, y };
}

/**
 * Camera that frames all content rects with breathing room. An empty map gets
 * a 1:1 camera looking at the origin area.
 */
export function fitCamera(rects: RectLike[], vw: number, vh: number, pad = 70): Camera {
  if (rects.length === 0 || vw <= 0 || vh <= 0) return { x: vw / 2 - 120, y: vh / 2 - 90, s: 1 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const s = clamp(Math.min((vw - pad * 2) / bw, (vh - pad * 2) / bh, 1), MIN_SCALE, MAX_SCALE);
  return {
    s,
    x: (vw - bw * s) / 2 - x0 * s,
    y: (vh - bh * s) / 2 - y0 * s,
  };
}
