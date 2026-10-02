'use client';

import type { CSSProperties } from 'react';
import styles from './BrushWash.module.css';

export interface BrushWashProps {
  /** The shape's measured size; nothing is drawn until it has one. */
  w: number;
  h: number;
  /** The shape's own outline (its wobRect path), which the wash fills. */
  d: string;
  /** The wash colour. */
  color: string;
  /** Where the pointer came in (or left), in the shape's coordinates. */
  x: number;
  y: number;
  /** Spread over the shape (true) or withdraw to nothing at (x, y). */
  on: boolean;
  /** How long a full spread takes: 460 ms for a card, 340 ms for a control. */
  duration: number;
  /** How far past the far corner the wash reaches, so it covers the wobble. */
  overshoot?: number;
}

/**
 * The hover brush of a hand-drawn surface (a card, a button): a wash that
 * spreads from where the pointer came in until it covers the shape, and
 * withdraws toward where it left.
 *
 * It is a disc that grows by `transform`, under the shape's outline as a
 * `clip-path`, so the browser runs the spread on the compositor: no frame of
 * it repaints the shape. (Grown as an SVG mask radius, every frame repainted
 * the whole card, its chalk and grain filters with it.) The disc's full size
 * is the farthest any spread can reach, so a withdrawal that starts somewhere
 * new simply keeps shrinking from where it is.
 */
export function BrushWash({ w, h, d, color, x, y, on, duration, overshoot = 6 }: BrushWashProps) {
  if (!w || !h || !d) return null;
  const full = Math.hypot(w, h) + overshoot;
  const reach = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) + overshoot;
  return (
    <div
      aria-hidden="true"
      data-brush-wash=""
      className={styles.region}
      style={{ width: w, height: h, clipPath: `path('${d}')` }}
    >
      <div
        className={styles.ink}
        data-on={on || undefined}
        style={
          {
            left: x - full,
            top: y - full,
            width: full * 2,
            height: full * 2,
            background: color,
            transform: `scale(${on ? reach / full : 0})`,
            transitionDuration: `${duration}ms`,
          } as CSSProperties
        }
      />
    </div>
  );
}
