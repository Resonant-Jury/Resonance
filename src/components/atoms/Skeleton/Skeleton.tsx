import type { CSSProperties } from 'react';
import styles from './Skeleton.module.css';

export interface SkeletonProps {
  /** CSS width (e.g. '80%', 120). Defaults to 100%. */
  width?: number | string;
  /** CSS height (e.g. 14, '1em'). Defaults to 14px. */
  height?: number | string;
  /** Corner radius in px, ignored when `circle`. */
  radius?: number;
  /** Render a circle (uses `width` as the diameter). */
  circle?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * A single grey placeholder block. Building block for skeleton states that
 * reuse a component's real layout and only swap text/icons for grey blocks.
 */
export function Skeleton({ width, height = 14, radius = 7, circle, className, style }: SkeletonProps) {
  const size = circle ? (width ?? height) : undefined;
  return (
    <span
      aria-hidden
      className={`${styles.block}${className ? ` ${className}` : ''}`}
      style={{
        width: circle ? size : (width ?? '100%'),
        height: circle ? size : height,
        borderRadius: circle ? '50%' : radius,
        ...style,
      }}
    />
  );
}
