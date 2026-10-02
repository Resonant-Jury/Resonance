'use client';

import { useMemo } from 'react';
import { wobRect, type SegValue } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { INK } from '@/lib/design/strokes';

export interface HandDrawnBorderProps {
  w: number;
  h: number;
  R?: number;
  seed?: number;
  mag?: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  chalkSeed?: number | null;
  /**
   * The chalk filter is defined once elsewhere on the page (`<ChalkFilters>`),
   * so this shape only refers to it. For a surface drawn many times over with
   * the same few seeds (the thought map's cards).
   */
  sharedChalk?: boolean;
  segmentsH?: SegValue;
  segmentsV?: SegValue;
  curve?: number;
  cornerJitter?: number;
  cornerOffset?: number;
}

export function HandDrawnBorder({
  w,
  h,
  R = 22,
  seed = 1,
  mag,
  fillColor,
  strokeColor,
  strokeWidth = INK,
  chalkSeed,
  sharedChalk = false,
  segmentsH,
  segmentsV,
  curve,
  cornerJitter = 1,
  cornerOffset = 0,
}: HandDrawnBorderProps) {
  const m = mag != null ? mag : autoMag(w, h);
  const c = curve != null ? curve : autoCurve(w, h);
  // Callers pass segment ranges as inline arrays ([3, 4]): key the path on
  // their values, not the array, or every render of the host redraws it.
  const segH = segKey(segmentsH != null ? segmentsH : autoSegments(w));
  const segV = segKey(segmentsV != null ? segmentsV : autoSegments(h));
  const path = useMemo(
    () =>
      wobRect(w, h, R, seed, m, {
        segmentsH: segValue(segH),
        segmentsV: segValue(segV),
        curve: c,
        cornerJitter,
        cornerOffset,
      }),
    [w, h, R, seed, m, segH, segV, c, cornerJitter, cornerOffset]
  );
  if (!w || !h) return null;
  const chalkId = chalkSeed != null ? chalkFilterId(chalkSeed) : null;

  return (
    <svg
      aria-hidden="true"
      className="res-shape-fade-in"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'visible',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    >
      {chalkSeed != null && !sharedChalk && (
        <defs>
          <ChalkFilter seed={chalkSeed} />
        </defs>
      )}
      {fillColor && (
        <path d={path} fill={fillColor} filter={chalkId ? `url(#${chalkId})` : undefined} />
      )}
      {strokeColor && (
        <path
          d={path}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/** `[3, 4]` → `'3-4'`, `3` → `3`: a segment value a memo can compare. */
function segKey(v: SegValue): number | string {
  return Array.isArray(v) ? `${v[0]}-${v[1]}` : v;
}

function segValue(k: number | string): SegValue {
  if (typeof k === 'number') return k;
  const [lo, hi] = k.split('-').map(Number);
  return [lo, hi];
}

export function chalkFilterId(seed: number): string {
  return `chalk-hdb-${seed}`;
}

/**
 * The chalk on a hand-drawn fill: warm fractal noise multiplied into the
 * fill, kept inside it. The same seed always makes the same filter, so a page
 * may define one twice without harm.
 */
function ChalkFilter({ seed }: { seed: number }) {
  return (
    <filter
      id={chalkFilterId(seed)}
      x="0%"
      y="0%"
      width="100%"
      height="100%"
      colorInterpolationFilters="sRGB"
    >
      <feTurbulence
        type="fractalNoise"
        baseFrequency={`${0.5 + (seed % 6) * 0.018} ${0.38 + (seed % 6) * 0.012}`}
        numOctaves={4}
        seed={seed + 30}
      />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.99  0 0 0 0 0.94  0 0 0 0 0.88  0 0 0 0.09 0"
        result="warmNoise"
      />
      <feBlend in="SourceGraphic" in2="warmNoise" mode="multiply" result="blended" />
      <feComposite in="blended" in2="SourceGraphic" operator="in" />
    </filter>
  );
}

/**
 * The chalk filters for `seeds`, defined once for every shape on the page
 * drawn with `sharedChalk` (the thought map's hundred cards share six). A
 * zero-sized svg, not `display: none`, which would switch its filters off.
 */
export function ChalkFilters({ seeds }: { seeds: readonly number[] }) {
  return (
    <svg aria-hidden="true" width={0} height={0} style={{ position: 'absolute' }}>
      <defs>
        {seeds.map((s) => (
          <ChalkFilter key={s} seed={s} />
        ))}
      </defs>
    </svg>
  );
}
