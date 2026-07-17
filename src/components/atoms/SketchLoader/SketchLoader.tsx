'use client';

import { useMemo, type CSSProperties } from 'react';
import { wobLoop } from '@/lib/design/wobLoop';
import styles from './SketchLoader.module.css';

export interface SketchLoaderProps {
  /** Outer box size in px. */
  size?: number;
  seed?: number;
  color?: string;
  ariaLabel?: string;
}

/**
 * Ink caravan: the stroke is a train of LINKS.length short dashes (each SEG
 * of the whole loop) travelling nose-to-tail along the path. Every link runs
 * the SAME literal keyframes (`sweep` in the module css) offset only by a
 * negative animation-delay — the front link is the wet pen tip at full ink,
 * each link behind is the same ink one step older and fainter, so a fixed
 * spot on the loop darkens when the pen passes and then fades away in place
 * as the caravan rolls over it. The dash period is exactly the path length
 * (pathLength = 1), so each sweep hands off seamlessly to the next: the pen
 * never lifts and nothing ever retracts. Literal keyframes + a single-subpath
 * `d` deliberately avoid two Chromium landmines: var() in @keyframes not
 * animating, and dash patterns duplicating per subpath when pathLength is
 * set on a multi-subpath path.
 */
const SEG = 0.12; // link length as a fraction of the loop
// Per-link ink alpha, back → front: link k rides k link-lengths AHEAD of
// link 0 (its negative delay advances its phase), so the LAST entry is the
// wet pen tip and earlier entries are the same ink progressively older.
const LINKS = [0.12, 0.19, 0.28, 0.4, 0.55, 0.95];
const TIP = LINKS.length - 1;
/** One full trip around the two-lap loop; sync with animation-duration in the css. */
const LOOP_MS = 2600;

/**
 * An organic "being inked" loader that behaves like a real pen, not a
 * spinner: one endless stroke spirals around the outer ring, glides into the
 * inner ring, and glides back out — a single closed two-lap loop — while the
 * ink laid down earlier fades away in place roughly a lap and a half behind
 * the tip. The pen never lifts, never retracts, and the trail's fade is the
 * only thing that ever disappears.
 */
export function SketchLoader({
  size = 64,
  seed = 7,
  color = 'var(--color-terracotta)',
  ariaLabel,
}: SketchLoaderProps) {
  const c = size / 2;

  // One closed subpath through both laps: outer ring easing into inner ring
  // and back. Radii/wobble match the old two-circle look, but as one stroke.
  const d = useMemo(
    () => wobLoop(c, c, size * 0.34, size * 0.27, seed, { segments: 9, mag: size * 0.03, cpJitter: 0.7 }),
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
        {LINKS.map((alpha, k) => (
          <path
            key={k}
            d={d}
            pathLength={1}
            fill="none"
            stroke={color}
            strokeWidth={size * 0.036}
            // Round cap only on the wet tip; butt caps let the older links
            // tile flush against each other with no cap-overlap beads.
            strokeLinecap={k === TIP ? 'round' : 'butt'}
            strokeLinejoin="round"
            className={k === TIP ? `${styles.trail} ${styles.tip}` : styles.trail}
            style={
              {
                // Dash period = path length, so exactly one dash is always on
                // the loop and it wraps the closure seamlessly — link k rides
                // k link-lengths behind the tip via its negative delay.
                strokeDasharray: `${SEG} ${1 - SEG}`,
                strokeOpacity: alpha,
                animationDelay: `${-k * SEG * LOOP_MS}ms`,
              } as CSSProperties
            }
          />
        ))}
      </svg>
    </span>
  );
}
