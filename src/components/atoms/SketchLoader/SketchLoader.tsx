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
 * An organic "being sketched" loader: a couple of wobbly hand-drawn rings that
 * continuously draw themselves on and sweep off, as if someone is doodling the
 * same circle over and over. The stroke is animated via `stroke-dashoffset`
 * with `pathLength={1}`, so the draw timing is independent of the real path
 * length. Used while an image upload is in flight.
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
      { d: wobCircle(c, c, size * 0.34, seed, { segments: 9, mag: size * 0.03, cpJitter: 0.7 }), delay: '0ms' },
      { d: wobCircle(c, c, size * 0.27, seed + 4, { segments: 8, mag: size * 0.035, cpJitter: 0.8 }), delay: '-700ms' },
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
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.035}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.ring}
            style={{ animationDelay: ring.delay }}
          />
        ))}
      </svg>
    </span>
  );
}
