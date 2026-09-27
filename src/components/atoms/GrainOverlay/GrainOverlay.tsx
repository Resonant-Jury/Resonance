'use client';

import { useId } from 'react';

export interface GrainOverlayProps {
  opacity?: number;
  extendTop?: number;
  extendBottom?: number;
}

/**
 * Paper grain over a surface: black ink whose alpha follows fractal noise.
 *
 * The overlay darkens what lies beneath by `opacity` on average (the tone the
 * cards were tuned against), and the noise spreads that darkening unevenly
 * from pixel to pixel so it reads as grain rather than a flat tint.
 */
export function GrainOverlay({ opacity = 0.06, extendTop = 0, extendBottom = 0 }: GrainOverlayProps) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: -extendTop,
        bottom: -extendBottom,
        width: '100%',
        height: `calc(100% + ${extendTop + extendBottom}px)`,
        pointerEvents: 'none',
        // The noise alpha below averages ½, so double it to keep `opacity`
        // as the mean darkening.
        opacity: Math.min(1, opacity * 2),
        zIndex: 10,
      }}
      aria-hidden="true"
    >
      <defs>
        <filter id={`grain-${id}`} x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves={4} stitchTiles="stitch" />
          {/* Black, with alpha = 1 − luminance of the noise: darker specks
              where the noise is dark, lighter where it is bright. */}
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 0 1"
          />
        </filter>
      </defs>
      <rect width="100%" height="100%" filter={`url(#grain-${id})`} />
    </svg>
  );
}
