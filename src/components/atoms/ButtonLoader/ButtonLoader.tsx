'use client';

import { useMemo, type CSSProperties } from 'react';
import { wobCircle } from '@/lib/design/wobCircle';
import { INK } from '@/lib/design/strokes';
import styles from './ButtonLoader.module.css';

/** Each link's ink, back → front: the last is the wet pen tip. */
const LINKS = [0.22, 0.42, 0.68, 1];
const TIP = LINKS.length - 1;
/** A link's length as a fraction of the loop. */
const SEG = 0.17;
/** One trip round the loop; keep in sync with the animation in the css. */
const LOOP_MS = 1100;

export interface ButtonLoaderProps {
  /** The box in px: 16 in a md / lg button, 14 in a sm one, an icon's size where it stands in for one. */
  size?: number;
}

/**
 * A button's "in progress" (round 5, B6): SketchLoader's ink caravan on one
 * small wobbly lap, in the label's own colour (currentColor), at the house
 * pen width. Decorative — the button carries the state (aria-busy). With
 * reduced motion the loop is drawn once and only breathes.
 */
export function ButtonLoader({ size = 16 }: ButtonLoaderProps) {
  const c = size / 2;
  const d = useMemo(
    () => wobCircle(c, c, size * 0.36, 29, { segments: 6, mag: size * 0.035, cpJitter: 0.6 }),
    [c, size],
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={styles.loader}
      aria-hidden
      data-button-loader=""
    >
      {LINKS.map((alpha, k) => (
        <path
          key={k}
          d={d}
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={INK}
          strokeLinecap={k === TIP ? 'round' : 'butt'}
          strokeLinejoin="round"
          className={styles.link}
          style={
            {
              strokeDasharray: `${SEG} ${1 - SEG}`,
              strokeOpacity: alpha,
              // Link k rides k link-lengths ahead of link 0.
              animationDelay: `${-k * SEG * LOOP_MS}ms`,
            } as CSSProperties
          }
        />
      ))}
      {/* Reduced motion: the whole loop, still (shown by the css only then). */}
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={INK}
        strokeLinejoin="round"
        strokeOpacity={0.75}
        className={styles.still}
      />
    </svg>
  );
}
