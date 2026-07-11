'use client';

import { useId, useMemo } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { seedFromString } from '@/lib/design/prng';
import { INK_LIGHT } from '@/lib/design/strokes';

export interface SquareFlagProps {
  /** ISO 3166-1 alpha-2 code matching a vendored file in `public/flags/`. */
  code: string;
  size?: number;
  /** Wobble seed; defaults to a hash of the code so each flag is stable. */
  seed?: number;
  /** Accessible name. Omit when a text label sits right next to the flag. */
  label?: string;
}

// The same "inked stamp" language as HandDrawnAvatar, tuned square-ish:
// generous corner radius and an assertive curve (these render small,
// 16–20px, where gentle wobble would vanish) so it sits closer to the
// avatar's roundness while still reading as a square item.
const FLAG_WOB = {
  segmentsH: 1 as const,
  segmentsV: 1 as const,
  curve: 1.6,
  cornerJitter: 3,
};

/**
 * A square national flag (vendored square-flags SVG) cropped by the same
 * hand-drawn wobbly outline as the avatar mask, so flags sit in the app's
 * pen-sketch world instead of reading as crisp screenshot rectangles.
 */
export function SquareFlag({ code, size = 18, seed, label }: SquareFlagProps) {
  const uid = useId().replace(/:/g, '');
  const path = useMemo(
    () =>
      wobRect(size, size, size * 0.3, seed ?? seedFromString(code), size * 0.05, {
        ...FLAG_WOB,
        cornerOffset: size * 0.06,
      }),
    [size, seed, code],
  );
  // Overscan the flag art past the viewBox so outward wobble bulges stay
  // covered by pixels instead of showing a blank sliver inside the stroke.
  const pad = Math.max(1, size * 0.06);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: 'block', flexShrink: 0, overflow: 'visible' }}
    >
      <defs>
        <clipPath id={`sqflag-${uid}`}>
          <path d={path} />
        </clipPath>
      </defs>
      <image
        href={`/flags/${code.toLowerCase()}.svg`}
        x={-pad}
        y={-pad}
        width={size + pad * 2}
        height={size + pad * 2}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#sqflag-${uid})`}
      />
      <path
        d={path}
        fill="none"
        stroke="oklch(36% 0.06 60 / 0.55)"
        strokeWidth={INK_LIGHT}
        strokeLinejoin="round"
      />
    </svg>
  );
}
