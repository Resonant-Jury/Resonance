import { makePrng } from './prng';

export type SegValue = number | [number, number];

export interface WobRectOpts {
  curve?: number;
  cornerJitter?: number;
  cornerOffset?: number;
  segmentsH?: SegValue;
  segmentsV?: SegValue;
  /**
   * Each corner's own radius, clockwise from the top left — a bubble in a stack keeps its outer
   * corners round and tucks the ones facing its neighbours. Each is jittered and capped the way
   * `R` is; without it all four are `R`. The twin of the Kotlin and Swift `cornerRadii`.
   */
  cornerRadii?: [number, number, number, number];
}

// Corners: bezier quarter-circles with slightly jittered radius.
// Edges: configurable number of cubics joined by seeded wobble anchors.
export function wobRect(
  W: number,
  H: number,
  R: number,
  seed: number,
  mag?: number,
  opts?: WobRectOpts
): string {
  const rnd = makePrng(seed);
  const m = mag != null ? mag : Math.min(W, H) * 0.025;
  const K = 0.552;

  const curve        = opts?.curve        ?? 1;
  const cornerJitter = opts?.cornerJitter ?? 1;
  const cornerOffset = opts?.cornerOffset ?? 0;

  const resolveSegs = (val: SegValue | undefined, fallback: number): number => {
    if (val == null) return fallback;
    if (Array.isArray(val)) {
      const [lo, hi] = val;
      return lo + Math.floor(rnd() * (hi - lo + 1));
    }
    return val | 0;
  };
  const segH = resolveSegs(opts?.segmentsH, 3);
  const segV = resolveSegs(opts?.segmentsV, 3);

  // The jitter follows each corner's own radius (all four are R unless the options say otherwise);
  // the PRNG is consumed in the same order either way, so a rect with equal radii is unchanged.
  const radii = opts?.cornerRadii;
  const corner = (r: number) => r + (rnd() - 0.5) * 2 * (Math.min(r * 0.07, Math.max(0, Math.min(W, H) / 2 - r) * 0.4) * cornerJitter);
  const Rtl = corner(radii?.[0] ?? R);
  const Rtr = corner(radii?.[1] ?? R);
  const Rbr = corner(radii?.[2] ?? R);
  const Rbl = corner(radii?.[3] ?? R);

  const oCap = Math.max(0, Math.min(W, H) * 0.5 - Math.max(Rtl, Rtr, Rbr, Rbl)) * 0.6;
  const oMag = Math.min(cornerOffset, oCap);
  const ox = () => (rnd() - 0.5) * 2 * oMag;
  const oy = () => (rnd() - 0.5) * 2 * oMag;
  const tlX = ox(), tlY = oy();
  const trX = ox(), trY = oy();
  const brX = ox(), brY = oy();
  const blX = ox(), blY = oy();

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
    segs: number
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
          : [x + (rnd() - 0.5) * 2 * perpAmp, y]
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

  const TLa: [number, number] = [0,              Rtl + tlY];
  const TLb: [number, number] = [Rtl + tlX,      0];
  const TRa: [number, number] = [W - Rtr + trX,  0];
  const TRb: [number, number] = [W,              Rtr + trY];
  const BRa: [number, number] = [W,              H - Rbr + brY];
  const BRb: [number, number] = [W - Rbr + brX,  H];
  const BLa: [number, number] = [Rbl + blX,      H];
  const BLb: [number, number] = [0,              H - Rbl + blY];

  const parts: string[] = [`M ${f(TLa[0])},${f(TLa[1])}`];

  parts.push(C(0, TLa[1] * (1 - K) + TLb[1] * K,
               TLb[0] * (1 - K) + TLa[0] * K, 0,
               TLb[0], TLb[1]));
  parts.push(...buildEdge(TLb, TRa, 'x', segH));

  parts.push(C(TRa[0] + (W - TRa[0]) * K, 0,
               W, TRb[1] * (1 - K),
               TRb[0], TRb[1]));
  parts.push(...buildEdge(TRb, BRa, 'y', segV));

  parts.push(C(W, BRa[1] + (H - BRa[1]) * K,
               BRb[0] + (W - BRb[0]) * K, H,
               BRb[0], BRb[1]));
  parts.push(...buildEdge(BRb, BLa, 'x', segH));

  parts.push(C(BLa[0] * (1 - K), H,
               0, BLb[1] + (H - BLb[1]) * K,
               BLb[0], BLb[1]));
  parts.push(...buildEdge(BLb, TLa, 'y', segV));

  parts.push('Z');
  return parts.join(' ');
}
