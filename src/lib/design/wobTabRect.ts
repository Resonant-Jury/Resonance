import { makePrng } from './prng';

export interface WobTabRectOpts {
  /** Card corner radius. Default 18. */
  R?: number;
  /** Tab corner radius (the two top corners of the bump). Default 9. */
  tabR?: number;
  /** Perpendicular wobble amplitude in px. Default 2.4. */
  mag?: number;
  /** Per-segment bow factor (wobRect's `curve`). Default 1. */
  curve?: number;
}

/**
 * One closed hand-drawn outline: a rounded rectangle W×H with a tab bump
 * rising `tabH` above its top edge, spanning x ∈ [tabX, tabX+tabW]. Drawn as
 * a single stroke so the tab and the card read as one surface — no seam, no
 * overlap tricks. Path coordinates live in a (W × H+tabH) box with the card's
 * top edge at y = tabH (so hosts place the svg at `top: -tabH`).
 *
 * Same-seed calls are deterministic (SSR/CSR parity, like wobRect).
 */
export function wobTabRect(
  W: number,
  H: number,
  tabX: number,
  tabW: number,
  tabH: number,
  seed: number,
  opts?: WobTabRectOpts,
): string {
  const rnd = makePrng(seed);
  const R = opts?.R ?? 18;
  const tabR = opts?.tabR ?? 9;
  const mag = opts?.mag ?? 2.4;
  const curve = opts?.curve ?? 1;
  const K = 0.552;
  const T = tabH; // card top edge in path space

  const f = (n: number) => +n.toFixed(2);
  const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) =>
    `C ${f(x1)},${f(y1)} ${f(x2)},${f(y2)} ${f(x)},${f(y)}`;

  const perpAmp = Math.min(mag * 0.95 * curve, Math.min(W, H) * 0.032 * Math.max(1, curve));

  const cubic = (P0: [number, number], P1: [number, number], axis: 'x' | 'y') => {
    if (axis === 'x') {
      const h = Math.abs(P1[0] - P0[0]) / 3;
      const dir = P1[0] >= P0[0] ? 1 : -1;
      return C(P0[0] + dir * h, P0[1], P1[0] - dir * h, P1[1], P1[0], P1[1]);
    }
    const h = Math.abs(P1[1] - P0[1]) / 3;
    const dir = P1[1] >= P0[1] ? 1 : -1;
    return C(P0[0], P0[1] + dir * h, P1[0], P1[1] - dir * h, P1[0], P1[1]);
  };

  /** Wobbly edge with ~1 anchor per 80px (at least `minSegs`). */
  const edge = (P0: [number, number], P1: [number, number], axis: 'x' | 'y', minSegs = 1): string[] => {
    const len = axis === 'x' ? Math.abs(P1[0] - P0[0]) : Math.abs(P1[1] - P0[1]);
    const segs = Math.max(minSegs, Math.round(len / 80));
    if (segs < 2 || len < perpAmp * 4) return [cubic(P0, P1, axis)];
    const out: string[] = [];
    let prev = P0;
    for (let i = 1; i < segs; i++) {
      const t = i / segs + (rnd() - 0.5) * Math.min(0.08, 0.4 / segs);
      const x = P0[0] + (P1[0] - P0[0]) * t;
      const y = P0[1] + (P1[1] - P0[1]) * t;
      const a: [number, number] =
        axis === 'x' ? [x, y + (rnd() - 0.5) * 2 * perpAmp] : [x + (rnd() - 0.5) * 2 * perpAmp, y];
      out.push(cubic(prev, a, axis));
      prev = a;
    }
    out.push(cubic(prev, P1, axis));
    return out;
  };

  // Slightly jittered radii so no two corners match.
  const jr = (r: number) => r + (rnd() - 0.5) * 2 * Math.min(r * 0.12, 2);
  const Rtl = jr(R), Rtr = jr(R), Rbr = jr(R), Rbl = jr(R);
  const rTl = jr(tabR), rTr = jr(tabR);

  const tabL = tabX;
  const tabRt = tabX + tabW;

  const parts: string[] = [`M ${f(0)},${f(T + Rtl)}`];

  // card top-left corner
  parts.push(C(0, (T + Rtl) * (1 - K) + T * K, Rtl * (1 - K), T, Rtl, T));
  // top edge → tab left base
  parts.push(...edge([Rtl, T], [tabL, T], 'x'));
  // tab left side (up)
  parts.push(...edge([tabL, T], [tabL, rTl], 'y'));
  // tab top-left corner
  parts.push(C(tabL, rTl * (1 - K), (tabL + rTl) - rTl * K, 0, tabL + rTl, 0));
  // tab top
  parts.push(...edge([tabL + rTl, 0], [tabRt - rTr, 0], 'x', 2));
  // tab top-right corner
  parts.push(C((tabRt - rTr) + rTr * K, 0, tabRt, rTr * (1 - K), tabRt, rTr));
  // tab right side (down)
  parts.push(...edge([tabRt, rTr], [tabRt, T], 'y'));
  // top edge continues → card top-right corner
  parts.push(...edge([tabRt, T], [W - Rtr, T], 'x'));
  parts.push(C((W - Rtr) + Rtr * K, T, W, (T + Rtr) * (1 - K) + T * K, W, T + Rtr));
  // right edge
  parts.push(...edge([W, T + Rtr], [W, T + H - Rbr], 'y', 2));
  // bottom-right corner
  parts.push(C(W, T + H - Rbr * (1 - K), W - Rbr * (1 - K), T + H, W - Rbr, T + H));
  // bottom edge
  parts.push(...edge([W - Rbr, T + H], [Rbl, T + H], 'x', 3));
  // bottom-left corner
  parts.push(C(Rbl * (1 - K), T + H, 0, T + H - Rbl * (1 - K), 0, T + H - Rbl));
  // left edge
  parts.push(...edge([0, T + H - Rbl], [0, T + Rtl], 'y', 2));

  parts.push('Z');
  return parts.join(' ');
}
