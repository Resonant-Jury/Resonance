// Shared geometry for organic dropdown menus (Subnavbar, CardActionsMenu):
// wavy row boundaries, smooth cubic divider paths, and the closed per-row
// regions used for hover washes. All functions are pure and deterministic
// (seeded), so menus render identically across SSR and hydration.

import { makePrng } from './prng';

// A gently wavy horizontal boundary between two rows, as a point list so the
// row fills and the stroked dividers share identical geometry. Runs from -pad
// to w+pad so fills overshoot and the outer clip trims them flush to the
// wobbly border (no slivers, dividers reach both edges).
export function rowBoundary(
  y: number,
  w: number,
  seed: number,
  amp: number,
  pad: number,
): [number, number][] {
  const steps = 4;
  const rnd = makePrng(seed);
  const f = (n: number): number => +n.toFixed(2);
  const pts: [number, number][] = [[-pad, f(y)]];
  for (let k = 0; k <= steps; k++) {
    const x = (k / steps) * w;
    const off = k === 0 || k === steps ? 0 : (rnd() - 0.5) * 2 * amp;
    pts.push([f(x), f(y + off)]);
  }
  pts.push([w + pad, f(y)]);
  return pts;
}

// Smooth cubic segments through the points, horizontal control handles.
export function segs(pts: [number, number][]): string {
  const f = (n: number): number => +n.toFixed(2);
  let d = '';
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const hx = (x1 - x0) / 3;
    d += ` C ${f(x0 + hx)},${f(y0)} ${f(x1 - hx)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

export const dividerPath = (pts: [number, number][]): string =>
  `M ${pts[0][0]},${pts[0][1]}` + segs(pts);

// Closed region for one row, bounded by the wavy divider above and below (or
// the padded panel edge for the first/last row), so the active wash fills the
// curve-divided area rather than a rectangle.
export function rowRegion(
  i: number,
  count: number,
  boundaries: [number, number][][],
  w: number,
  h: number,
  pad: number,
): string {
  const top: [number, number][] = i === 0 ? [[-pad, -pad], [w + pad, -pad]] : boundaries[i - 1];
  const bottom: [number, number][] =
    i === count - 1 ? [[-pad, h + pad], [w + pad, h + pad]] : boundaries[i];
  const botRev = [...bottom].reverse();
  return (
    `M ${top[0][0]},${top[0][1]}` +
    segs(top) +
    ` L ${botRev[0][0]},${botRev[0][1]}` +
    segs(botRev) +
    ' Z'
  );
}
