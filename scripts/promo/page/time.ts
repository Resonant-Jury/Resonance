/**
 * Time for the promo: every value on screen is a pure function of the
 * frame's time, so a frame can be rendered alone, in any order, and twice
 * the same. Nothing here keeps state.
 */

export const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** How far t is through [a, b], 0 → 1, held at both ends. */
export const prog = (t: number, a: number, b: number) => (b === a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));

export type Ease = (p: number) => number;

export const ease = {
  linear: (p: number) => p,
  inQuad: (p: number) => p * p,
  outQuad: (p: number) => 1 - (1 - p) * (1 - p),
  inOutQuad: (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2),
  inCubic: (p: number) => p * p * p,
  outCubic: (p: number) => 1 - Math.pow(1 - p, 3),
  inOutCubic: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  outQuart: (p: number) => 1 - Math.pow(1 - p, 4),
  inOutQuart: (p: number) => (p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2),
  outExpo: (p: number) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  /** Overshoots a little and settles: a card set down, a pill popping in. */
  outBack: (p: number) => {
    const c1 = 1.45;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  },
} satisfies Record<string, Ease>;

/**
 * A damped spring released at `start` toward 1 (0 before it): a quick rise,
 * one soft overshoot, settled within about `settle` seconds.
 */
export function spring(t: number, start: number, settle = 0.7, bounce = 0.18): number {
  const x = t - start;
  if (x <= 0) return 0;
  const zeta = clamp(1 - bounce * 2.2, 0.2, 1);
  const omega = 8.5 / settle;
  if (zeta >= 1) return 1 - (1 + omega * x) * Math.exp(-omega * x);
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * x) * (Math.cos(wd * x) + ((zeta * omega) / wd) * Math.sin(wd * x));
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The text as typed so far: `p` of its characters (whole graphemes, CJK or not). */
export function typed(text: string, p: number): string {
  const g = [...segmenter.segment(text)].map((s) => s.segment);
  return g.slice(0, Math.round(clamp(p) * g.length)).join('');
}

/** A slow, seamless drift for things that should never stand still: ±1 around 0. */
export function drift(t: number, period: number, phase = 0): number {
  return Math.sin(((t / period) * 2 + phase) * Math.PI);
}
