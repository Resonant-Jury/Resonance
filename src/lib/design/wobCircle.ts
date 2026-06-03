import { makePrng } from './prng';

export interface WobCircleOpts {
  /** Number of bezier arc segments (more = more wobble anchor points). Default 8. */
  segments?: number;
  /** Amplitude of radius wobble in px. Default 1.5. */
  mag?: number;
  /** Extra jitter on bezier control points (0 = smooth arcs, 1 = full). Default 0.6. */
  cpJitter?: number;
}

/**
 * Generate a hand-drawn wobbly circle as an SVG path string.
 *
 * Divides the circle into `segments` bezier arcs, perturbs each anchor
 * point's radius by a seeded random offset, and adds jitter to the
 * control points so the arcs themselves feel sketchy.
 *
 * The circle is centred at (cx, cy) with nominal radius r.
 */
export function wobCircle(
  cx: number,
  cy: number,
  r: number,
  seed: number,
  opts?: WobCircleOpts,
): string {
  const rnd = makePrng(seed);
  const segments = opts?.segments ?? 8;
  const mag = opts?.mag ?? 1.5;
  const cpJitter = opts?.cpJitter ?? 0.6;

  const f = (n: number) => +n.toFixed(2);

  // Generate anchor points with wobbled radii
  const anchors: { x: number; y: number; angle: number; r: number }[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const rr = r + (rnd() - 0.5) * 2 * mag;
    anchors.push({
      x: cx + Math.cos(angle) * rr,
      y: cy + Math.sin(angle) * rr,
      angle,
      r: rr,
    });
  }

  // k = ideal bezier handle length for a circle arc of (2π / segments)
  const k = (4 / 3) * Math.tan(Math.PI / (2 * segments));
  const cpMag = mag * cpJitter;

  const parts: string[] = [`M ${f(anchors[0].x)},${f(anchors[0].y)}`];

  for (let i = 0; i < segments; i++) {
    const a0 = anchors[i];
    const a1 = anchors[(i + 1) % segments];

    // Control point 1: perpendicular to radius at a0, pointing forward
    const cp1x = a0.x - Math.sin(a0.angle) * a0.r * k + (rnd() - 0.5) * 2 * cpMag;
    const cp1y = a0.y + Math.cos(a0.angle) * a0.r * k + (rnd() - 0.5) * 2 * cpMag;

    // Control point 2: perpendicular to radius at a1, pointing backward
    const cp2x = a1.x + Math.sin(a1.angle) * a1.r * k + (rnd() - 0.5) * 2 * cpMag;
    const cp2y = a1.y - Math.cos(a1.angle) * a1.r * k + (rnd() - 0.5) * 2 * cpMag;

    parts.push(
      `C ${f(cp1x)},${f(cp1y)} ${f(cp2x)},${f(cp2y)} ${f(a1.x)},${f(a1.y)}`,
    );
  }

  parts.push('Z');
  return parts.join(' ');
}
