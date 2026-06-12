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

export function rectCenter(r: RectLike): { x: number; y: number } {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectContains(r: RectLike, p: { x: number; y: number }): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

export function rectsIntersect(a: RectLike, b: RectLike): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** True when `inner` sits entirely within `outer`. */
export function rectInside(inner: RectLike, outer: RectLike): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

/** Grow a rect by `pad` on every side (used for "near a card" hit zones). */
export function inflateRect(r: RectLike, pad: number): RectLike {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/**
 * Folder-style membership while a node is being dragged, with hysteresis:
 * a filed card stays in its group while any part of it still overlaps the
 * region (it renders clipped at the boundary); only once fully outside does
 * it leave. An unfiled card joins a group only when it slides fully inside —
 * overlapping groups resolve to the tightest one.
 */
export function dragMembership(
  rect: RectLike,
  currentGroupId: string | null,
  groups: GroupRect[],
): string | null {
  const current = currentGroupId ? groups.find((g) => g.id === currentGroupId) : undefined;
  if (current && rectsIntersect(rect, current)) return current.id;
  let best: GroupRect | null = null;
  for (const g of groups) {
    if (!rectInside(rect, g)) continue;
    if (!best || g.w * g.h < best.w * best.h) best = g;
  }
  return best?.id ?? null;
}

/**
 * Which group a point falls in. Overlapping groups resolve to the smallest
 * (tightest) region, so a card dropped into a group drawn inside a bigger one
 * files into the inner category.
 */
export function containingGroupId(p: { x: number; y: number }, groups: GroupRect[]): string | null {
  let best: GroupRect | null = null;
  for (const g of groups) {
    if (!rectContains(g, p)) continue;
    if (!best || g.w * g.h < best.w * best.h) best = g;
  }
  return best?.id ?? null;
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
