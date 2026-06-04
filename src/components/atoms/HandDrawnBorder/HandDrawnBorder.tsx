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
  segmentsH,
  segmentsV,
  curve,
  cornerJitter = 1,
  cornerOffset = 0,
}: HandDrawnBorderProps) {
  const m = mag != null ? mag : autoMag(w, h);
  const c = curve != null ? curve : autoCurve(w, h);
  const segH: SegValue = segmentsH != null ? segmentsH : autoSegments(w);
  const segV: SegValue = segmentsV != null ? segmentsV : autoSegments(h);
  const path = useMemo(
    () => wobRect(w, h, R, seed, m, { segmentsH: segH, segmentsV: segV, curve: c, cornerJitter, cornerOffset }),
    [w, h, R, seed, m, segH, segV, c, cornerJitter, cornerOffset]
  );
  if (!w || !h) return null;
  const chalkId = chalkSeed != null ? `chalk-hdb-${chalkSeed}` : null;

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
      {chalkId && chalkSeed != null && (
        <defs>
          <filter
            id={chalkId}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={`${0.5 + (chalkSeed % 6) * 0.018} ${0.38 + (chalkSeed % 6) * 0.012}`}
              numOctaves={4}
              seed={chalkSeed + 30}
            />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.99  0 0 0 0 0.94  0 0 0 0 0.88  0 0 0 0.09 0"
              result="warmNoise"
            />
            <feBlend in="SourceGraphic" in2="warmNoise" mode="multiply" result="blended" />
            <feComposite in="blended" in2="SourceGraphic" operator="in" />
          </filter>
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
