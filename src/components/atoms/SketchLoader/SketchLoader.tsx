'use client';

import { useMemo } from 'react';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './SketchLoader.module.css';

export interface SketchLoaderProps {
  /** Outer box size in px. */
  size?: number;
  seed?: number;
  color?: string;
  ariaLabel?: string;
}

/**
 * An organic "being inked" loader: a wobbly hand-drawn ring swept by a comet
 * of ink. The pen tip (the leading edge) is darkest and the trail fades
 * continuously behind it — the gradient comes from a conic-gradient alpha
 * mask that rotates together with the artwork, so the tip travels forever
 * instead of re-drawing a fresh pass each lap. Layered on top, the whole
 * mark slowly dries: over roughly two revolutions it fades to nothing, then
 * a quick re-ink starts the next cycle (the restart lands while opacity is
 * 0, so it never pops).
 */
export function SketchLoader({
  size = 64,
  seed = 7,
  color = 'var(--color-terracotta)',
  ariaLabel,
}: SketchLoaderProps) {
  const c = size / 2;

  // Two concentric-ish rings with slightly different radii + seeds so the
  // overlap reads as quick repeated pencil passes rather than one clean circle.
  const rings = useMemo(
    () => [
      { d: wobCircle(c, c, size * 0.34, seed, { segments: 9, mag: size * 0.03, cpJitter: 0.7 }), width: size * 0.04 },
      { d: wobCircle(c, c, size * 0.27, seed + 4, { segments: 8, mag: size * 0.035, cpJitter: 0.8 }), width: size * 0.032 },
    ],
    [c, size, seed],
  );

  return (
    <span
      className={styles.wrap}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className={styles.svg}
        aria-hidden
      >
        {rings.map((ring, i) => (
          <path
            key={i}
            d={ring.d}
            fill="none"
            stroke={color}
            strokeWidth={ring.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </span>
  );
}
