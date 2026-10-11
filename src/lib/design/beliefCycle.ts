import { makePrng } from './prng';

/**
 * The About page's belief cycle: three hand-drawn arrows round a ring, each
 * an annular sector whose leading end is a chevron that nests in the next
 * one's notch (共振 → 立體 → 體悟 → 共振). Pure geometry, seeded, so the
 * server's SVG and the client's are the same.
 */

export interface CycleArc {
  /** Closed outline of the arrow. */
  d: string;
  /** Where its label sits: the middle of the band, at the arc's middle angle. */
  label: [number, number];
}

const f = (n: number) => +n.toFixed(2);
const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [
  cx + Math.cos(rad(deg)) * r,
  cy + Math.sin(rad(deg)) * r,
];

/** A smooth curve through the points (Catmull-Rom as cubics), continuing a path already at pts[0]. */
function through(pts: [number, number][]): string {
  let d = '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(
      p2[1] - (p3[1] - p1[1]) / 6,
    )} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

/** A pen's straight stroke: a quadratic whose middle strays a little from the line. */
function stroke(rnd: () => number, from: [number, number], to: [number, number], mag: number): string {
  const mx = (from[0] + to[0]) / 2 + (rnd() - 0.5) * 2 * mag;
  const my = (from[1] + to[1]) / 2 + (rnd() - 0.5) * 2 * mag;
  return ` Q ${f(mx)},${f(my)} ${f(to[0])},${f(to[1])}`;
}

/**
 * One arrow from angle `from` to `to` (degrees, clockwise on screen) between
 * radii `inner` and `outer`; its chevron reaches `tip` degrees past `to`, and
 * its tail is notched as deep, so the arrow before it fits there.
 */
export function cycleArc(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  from: number,
  to: number,
  seed: number,
  tip = 9,
  mag = 2.2,
): CycleArc {
  const rnd = makePrng(seed);
  const mid = (inner + outer) / 2;
  const arc = (r: number, a0: number, a1: number) => {
    const n = Math.max(3, Math.round(Math.abs(a1 - a0) / 16));
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      // The ends stay put so the chevron's corners meet the arc exactly.
      const wob = i === 0 || i === n ? 0 : (rnd() - 0.5) * 2 * mag;
      pts.push(polar(cx, cy, r + wob, a));
    }
    return pts;
  };

  const outerArc = arc(outer, from, to);
  const innerArc = arc(inner, to, from);
  const tipPt = polar(cx, cy, mid, to + tip);
  const notch = polar(cx, cy, mid, from + tip);

  let d = `M ${f(outerArc[0][0])},${f(outerArc[0][1])}`;
  d += through(outerArc);
  d += stroke(rnd, outerArc[outerArc.length - 1], tipPt, mag * 0.6);
  d += stroke(rnd, tipPt, innerArc[0], mag * 0.6);
  d += through(innerArc);
  d += stroke(rnd, innerArc[innerArc.length - 1], notch, mag * 0.6);
  d += stroke(rnd, notch, outerArc[0], mag * 0.6);
  d += ' Z';

  const [lx, ly] = polar(cx, cy, mid, (from + to) / 2 + tip / 2);
  return { d, label: [f(lx), f(ly)] };
}
