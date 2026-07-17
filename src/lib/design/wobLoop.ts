import { makePrng } from './prng';

export interface WobLoopOpts {
  /** Number of bezier arc segments per lap (more = more wobble anchor points). Default 8. */
  segments?: number;
  /** Amplitude of radius wobble in px. Default 1.5. */
  mag?: number;
  /** Extra jitter on bezier control points (0 = smooth arcs, 1 = full). Default 0.6. */
  cpJitter?: number;
  /** Fraction of the whole loop over which each radius transition eases. Default 0.12. */
  blend?: number;
}

/** Cosine ease with zero slope at both ends, so the radius transitions join
 *  the constant-radius stretches without kinks. */
function ease(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * Generate a hand-drawn two-lap loop as ONE closed SVG subpath: a full lap at
 * radius `rA`, easing into a full lap at radius `rB`, easing back out to
 * close seamlessly where it began. Because it is a single subpath, a pen
 * (dash) travelling along it never lifts — it spirals from the outer ring
 * into the inner one and wraps around forever.
 *
 * Same construction as `wobCircle`: seeded radius wobble per anchor and
 * jittered perpendicular bezier handles, so it reads as the same pen.
 *
 * Centred at (cx, cy); `t` runs 0→1 over both laps (angle 0→4π).
 */
export function wobLoop(
  cx: number,
  cy: number,
  rA: number,
  rB: number,
  seed: number,
  opts?: WobLoopOpts,
): string {
  const rnd = makePrng(seed);
  const segments = opts?.segments ?? 8;
  const mag = opts?.mag ?? 1.5;
  const cpJitter = opts?.cpJitter ?? 0.6;
  const blend = opts?.blend ?? 0.12;

  const f = (n: number) => +n.toFixed(2);

  // Fraction of the way from rA to rB at loop position t ∈ [0, 1):
  // lap 1 rides rA, eases to rB just before the halfway point, lap 2 rides
  // rB, and eases back to rA just before the wrap — so t = 1 meets t = 0
  // with matching radius and zero radial slope.
  const towardB = (t: number): number => {
    if (t < 0.5 - blend) return 0;
    if (t < 0.5) return ease((t - (0.5 - blend)) / blend);
    if (t < 1 - blend) return 1;
    return 1 - ease((t - (1 - blend)) / blend);
  };

  const n = segments * 2; // anchors across both laps
  const anchors: { x: number; y: number; angle: number; r: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const angle = t * Math.PI * 4;
    const base = rA + (rB - rA) * towardB(t);
    const rr = base + (rnd() - 0.5) * 2 * mag;
    anchors.push({
      x: cx + Math.cos(angle) * rr,
      y: cy + Math.sin(angle) * rr,
      angle,
      r: rr,
    });
  }

  // k = ideal bezier handle length for a circle arc of (2π / segments) —
  // anchors sit 2π/segments apart in angle, exactly as in wobCircle.
  const k = (4 / 3) * Math.tan(Math.PI / (2 * segments));
  const cpMag = mag * cpJitter;

  const parts: string[] = [`M ${f(anchors[0].x)},${f(anchors[0].y)}`];

  for (let i = 0; i < n; i++) {
    const a0 = anchors[i];
    const a1 = anchors[(i + 1) % n];

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
