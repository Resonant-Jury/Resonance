import { makePrng } from './prng';

/**
 * Geometry for thought-map arrows: where a curve leaves one card rectangle,
 * how it bows organically toward the other, and where the arrowhead / label
 * sit. Pure + seeded, so SSR and client draw the identical curve.
 */

export interface RectLike {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface EdgeAnchor {
  x: number;
  y: number;
  /** Outward unit normal of the rect side the anchor sits on. */
  nx: number;
  ny: number;
}

export interface EdgeGeometry {
  /** SVG path data of the connecting cubic. */
  d: string;
  start: EdgeAnchor;
  end: EdgeAnchor;
  /** Point on the curve at t = 0.5 — where the relation label hangs. */
  mid: { x: number; y: number };
  /** Tangent angle (radians) of the curve as it arrives at `end`. */
  endAngle: number;
}

const f = (n: number) => +n.toFixed(2);

/**
 * Anchor on `rect`'s border facing `toward`: the side is chosen by the
 * dominant axis between centers, and the anchor slides a little along that
 * side toward the other shape so near-parallel cards don't all connect at
 * dead center.
 */
export function rectAnchor(rect: RectLike, toward: { x: number; y: number }): EdgeAnchor {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const slide = clamp(dy * 0.25, -rect.h / 2 + 14, rect.h / 2 - 14);
    return dx >= 0
      ? { x: rect.x + rect.w, y: cy + slide, nx: 1, ny: 0 }
      : { x: rect.x, y: cy + slide, nx: -1, ny: 0 };
  }
  const slide = clamp(dx * 0.25, -rect.w / 2 + 14, rect.w / 2 - 14);
  return dy >= 0
    ? { x: cx + slide, y: rect.y + rect.h, nx: 0, ny: 1 }
    : { x: cx + slide, y: rect.y, nx: 0, ny: -1 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function cubicPoint(
  t: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
): { x: number; y: number } {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
    y: a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
  };
}

/**
 * The organic cubic between two card rects. Control points push outward along
 * each anchor's normal (so the curve leaves a card perpendicular to its edge,
 * like a drawn stroke), with a seeded sideways wobble that keeps multiple
 * arrows from looking machine-perfect.
 */
export function organicEdgePath(source: RectLike, target: RectLike, seed: number): EdgeGeometry {
  const rnd = makePrng(seed);
  const sc = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
  const tc = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const start = rectAnchor(source, tc);
  const end = rectAnchor(target, sc);

  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const reach = clamp(dist * 0.38, 26, 150);
  const jitter = () => (rnd() - 0.5) * Math.min(18, dist * 0.12);

  const p0: [number, number] = [start.x, start.y];
  const p1: [number, number] = [
    start.x + start.nx * reach + (start.nx === 0 ? jitter() : 0),
    start.y + start.ny * reach + (start.ny === 0 ? jitter() : 0),
  ];
  const p2: [number, number] = [
    end.x + end.nx * reach + (end.nx === 0 ? jitter() : 0),
    end.y + end.ny * reach + (end.ny === 0 ? jitter() : 0),
  ];
  const p3: [number, number] = [end.x, end.y];

  const d = `M ${f(p0[0])},${f(p0[1])} C ${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(p3[0])},${f(p3[1])}`;
  const mid = cubicPoint(0.5, p0, p1, p2, p3);
  // Tangent at t=1 is along (p3 - p2).
  const endAngle = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]);
  return { d, start, end, mid: { x: f(mid.x), y: f(mid.y) }, endAngle };
}

/**
 * A hand-drawn arrowhead: two slightly asymmetric strokes swept back from the
 * tip. Returned as open path data to stroke with round caps.
 */
export function arrowHeadPath(tip: { x: number; y: number }, angle: number, size: number, seed: number): string {
  const rnd = makePrng(seed);
  const spread = 0.46;
  const wing = (sign: 1 | -1) => {
    const a = angle + Math.PI + sign * (spread + (rnd() - 0.5) * 0.12);
    const len = size * (0.92 + rnd() * 0.2);
    const ex = tip.x + Math.cos(a) * len;
    const ey = tip.y + Math.sin(a) * len;
    // Bow the wing slightly so it reads as a pen flick, not a ruler mark.
    const mx = tip.x + Math.cos(a) * len * 0.5 + Math.cos(a + Math.PI / 2) * sign * size * 0.12;
    const my = tip.y + Math.sin(a) * len * 0.5 + Math.sin(a + Math.PI / 2) * sign * size * 0.12;
    return `M ${f(tip.x)},${f(tip.y)} Q ${f(mx)},${f(my)} ${f(ex)},${f(ey)}`;
  };
  return `${wing(1)} ${wing(-1)}`;
}
