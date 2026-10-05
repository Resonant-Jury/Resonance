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

/**
 * A pen's wavy underline, drawn at its real width: a crest every ~`half` px,
 * alternating up and down the way a hand keeps a rhythm rather than a period —
 * each crest's height (65–135% of `amp`) and place (±15% of a step) nudged by
 * the seed — settling back on the line at both ends. Smooth through horizontal
 * handles, like pointsToBezier.
 */
export function penWavePoints(W: number, seed = 1, amp = 1.2, half = 4.5): [number, number][] {
  const rnd = makePrng(seed);
  const n = Math.max(2, Math.round(W / half));
  const step = W / n;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n) {
      pts.push([i * step, 0]);
      continue;
    }
    const x = i * step + (rnd() - 0.5) * step * 0.3;
    const y = (i % 2 === 1 ? -1 : 1) * amp * (0.65 + 0.7 * rnd());
    pts.push([x, y]);
  }
  return pts;
}

/** {@link penWavePoints} as a path from (0,0) to (W,0). */
export function penWave(W: number, seed = 1, amp = 1.2, half = 4.5): string {
  return pointsToBezier(penWavePoints(W, seed, amp, half));
}

/**
 * {@link penWavePoints} for a tile that repeats side by side: an even number
 * of steps, and both ends on the same down crest (`amp` under the line,
 * where the smoothing's horizontal handles make it a crest), so tile after
 * tile the up-and-down rhythm carries across every seam with no flat step —
 * the seam is just one more crest. Interior crests are penWavePoints' own.
 */
export function penWaveTilePoints(W: number, seed = 1, amp = 1.2, half = 4.5): [number, number][] {
  const rnd = makePrng(seed);
  let n = Math.max(2, Math.round(W / half));
  if (n % 2 === 1) n += 1;
  const step = W / n;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    if (i === 0 || i === n) {
      pts.push([i * step, amp]);
      continue;
    }
    const x = i * step + (rnd() - 0.5) * step * 0.3;
    const y = (i % 2 === 1 ? -1 : 1) * amp * (0.65 + 0.7 * rnd());
    pts.push([x, y]);
  }
  return pts;
}

/** {@link penWaveTilePoints} as a path from (0,amp) to (W,amp). */
export function penWaveTile(W: number, seed = 1, amp = 1.2, half = 4.5): string {
  return pointsToBezier(penWaveTilePoints(W, seed, amp, half));
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
