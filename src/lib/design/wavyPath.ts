import { makePrng } from './prng';

export function wavyLine(W: number, seed = 1, amp = 2, steps = 5): string {
  const rnd = makePrng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * W;
    const y = i === 0 || i === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([x, y]);
  }
  const f = (n: number) => +n.toFixed(2);
  let d = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const h = (x1 - x0) / 3;
    d += ` C ${f(x0 + h)},${f(y0)} ${f(x1 - h)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

// Vertical sibling of wavyLine: a wobbly line running down the y-axis, with x
// jittering around 0. Endpoints stay on the axis so it tiles cleanly as a
// divider between segments.
export function wavyVertical(H: number, seed = 1, amp = 2, steps = 5): string {
  const rnd = makePrng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = t * H;
    const x = i === 0 || i === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([x, y]);
  }
  const f = (n: number) => +n.toFixed(2);
  let d = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const v = (y1 - y0) / 3;
    d += ` C ${f(x0)},${f(y0 + v)} ${f(x1)},${f(y1 - v)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

export function wavyPoints(
  W: number,
  y0: number,
  amp: number,
  seed: number,
  steps: number
): [number, number][] {
  const rnd = makePrng(seed);
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * W + (i > 0 && i < steps ? (rnd() - 0.5) * (W / steps) * 0.18 : 0);
    const y = i === 0 || i === steps ? y0 : y0 - (rnd() - 0.5) * 2 * amp;
    pts.push([x, y]);
  }
  return pts;
}

export function pointsToBezier(pts: [number, number][]): string {
  const f = (n: number) => +n.toFixed(2);
  let out = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    out += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return out;
}
