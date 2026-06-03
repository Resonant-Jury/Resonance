import { makePrng } from './prng';
import type { SegValue, WobRectOpts } from './wobRect';

/**
 * Open-top sibling of {@link wobRect}: draws only the left, bottom and right
 * edges with rounded *bottom* corners, leaving the top edge open (no stroke,
 * no `Z`). The path starts at the top-left corner, runs down the left edge,
 * across the bottom, and up the right edge to the top-right corner.
 *
 * Used by the organic dropdown panel that connects directly beneath its
 * trigger — the panel reads as a continuation of the trigger box, so it must
 * not draw a line across the seam between them.
 */
export function wobOpenTop(
  W: number,
  H: number,
  R: number,
  seed: number,
  mag?: number,
  opts?: WobRectOpts,
): string {
  const rnd = makePrng(seed);
  const m = mag != null ? mag : Math.min(W, H) * 0.025;
  const K = 0.552;

  const curve = opts?.curve ?? 1;
  const cornerJitter = opts?.cornerJitter ?? 1;

  const resolveSegs = (val: SegValue | undefined, fallback: number): number => {
    if (val == null) return fallback;
    if (Array.isArray(val)) {
      const [lo, hi] = val;
      return lo + Math.floor(rnd() * (hi - lo + 1));
    }
    return val | 0;
  };
  const segH = resolveSegs(opts?.segmentsH, 4);
  const segV = resolveSegs(opts?.segmentsV, 3);

  const rVar = Math.min(R * 0.07, Math.max(0, Math.min(W, H) / 2 - R) * 0.4) * cornerJitter;
  const Rbl = R + (rnd() - 0.5) * 2 * rVar;
  const Rbr = R + (rnd() - 0.5) * 2 * rVar;

  const perpAmp = Math.min(m * 0.95 * curve, Math.min(W, H) * 0.032 * Math.max(1, curve));

  const f = (n: number) => +n.toFixed(2);
  const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
    `C ${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x)},${f(y)}`;

  const cubicH = (P0: [number, number], P1: [number, number]) => {
    const h = Math.abs(P1[0] - P0[0]) / 3;
    const dir = P1[0] >= P0[0] ? 1 : -1;
    return C(P0[0] + dir * h, P0[1], P1[0] - dir * h, P1[1], P1[0], P1[1]);
  };
  const cubicV = (P0: [number, number], P1: [number, number]) => {
    const h = Math.abs(P1[1] - P0[1]) / 3;
    const dir = P1[1] >= P0[1] ? 1 : -1;
    return C(P0[0], P0[1] + dir * h, P1[0], P1[1] - dir * h, P1[0], P1[1]);
  };

  const buildEdge = (
    P0: [number, number],
    P1: [number, number],
    axis: 'x' | 'y',
    segs: number,
  ): string[] => {
    const emit = axis === 'x' ? cubicH : cubicV;
    const len = axis === 'x' ? Math.abs(P1[0] - P0[0]) : Math.abs(P1[1] - P0[1]);
    if (segs < 2 || len < perpAmp * 4) return [emit(P0, P1)];
    const anchors: [number, number][] = [];
    const anchorJitter = Math.min(0.08, 0.4 / segs);
    for (let i = 1; i < segs; i++) {
      const t = i / segs + (rnd() - 0.5) * anchorJitter;
      const x = P0[0] + (P1[0] - P0[0]) * t;
      const y = P0[1] + (P1[1] - P0[1]) * t;
      anchors.push(
        axis === 'x'
          ? [x, y + (rnd() - 0.5) * 2 * perpAmp]
          : [x + (rnd() - 0.5) * 2 * perpAmp, y],
      );
    }
    const result: string[] = [];
    let prev = P0;
    for (const a of anchors) {
      result.push(emit(prev, a));
      prev = a;
    }
    result.push(emit(prev, P1));
    return result;
  };

  const TL: [number, number] = [0, 0];
  const BLa: [number, number] = [0, H - Rbl];
  const BLb: [number, number] = [Rbl, H];
  const BRa: [number, number] = [W - Rbr, H];
  const BRb: [number, number] = [W, H - Rbr];
  const TR: [number, number] = [W, 0];

  const parts: string[] = [`M ${f(TL[0])},${f(TL[1])}`];

  // Left edge: top-left down to the bottom-left corner.
  parts.push(...buildEdge(TL, BLa, 'y', segV));
  // Bottom-left corner.
  parts.push(C(0, BLa[1] + Rbl * K, BLb[0] - Rbl * K, H, BLb[0], BLb[1]));
  // Bottom edge.
  parts.push(...buildEdge(BLb, BRa, 'x', segH));
  // Bottom-right corner.
  parts.push(C(BRa[0] + Rbr * K, H, W, BRb[1] + Rbr * K, BRb[0], BRb[1]));
  // Right edge: up to the top-right corner.
  parts.push(...buildEdge(BRb, TR, 'y', segV));

  return parts.join(' ');
}
