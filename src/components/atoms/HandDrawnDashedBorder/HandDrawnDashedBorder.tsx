'use client';

import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { wobRect, type SegValue } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK } from '@/lib/design/strokes';
import styles from './HandDrawnDashedBorder.module.css';

export interface HandDrawnDashedBorderProps {
  w: number;
  h: number;
  R?: number;
  seed?: number;
  mag?: number;
  strokeColor?: string;
  strokeWidth?: number;
  /** SVG dasharray string, e.g. "7 6". */
  dashArray?: string;
  fillColor?: string;
  segmentsH?: SegValue;
  segmentsV?: SegValue;
  curve?: number;
  className?: string;
}

export function HandDrawnDashedBorder({
  w,
  h,
  R = 16,
  seed = 1,
  mag,
  strokeColor = 'var(--field-border)',
  strokeWidth = INK,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dashArray,
  fillColor,
  segmentsH,
  segmentsV,
  curve,
  className,
}: HandDrawnDashedBorderProps) {
  const m = mag != null ? mag : autoMag(w, h);
  const c = curve != null ? curve : autoCurve(w, h);
  const segH: SegValue = segmentsH != null ? segmentsH : autoSegments(w);
  const segV: SegValue = segmentsV != null ? segmentsV : autoSegments(h);
  const path = useMemo(
    () => wobRect(w, h, R, seed, m, { segmentsH: segH, segmentsV: segV, curve: c }),
    [w, h, R, seed, m, segH, segV, c],
  );
  if (!w || !h) return null;

  return (
    <svg
      aria-hidden="true"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={[styles.svg, className].filter(Boolean).join(' ')}
    >
      {fillColor && <path d={path} fill={fillColor} />}
      <path
        d={path}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface HandDrawnDashedSurfaceProps {
  children: ReactNode;
  R?: number;
  seed?: number;
  mag?: number;
  /** Visual state — drives stroke color through CSS var. */
  state?: 'idle' | 'hover' | 'focus';
  strokeColor?: string;
  strokeWidth?: number;
  /** Unused — kept for back-compat after dashed→curve rework. */
  dashArray?: string;
  /** Override per-segment bow. Leave undefined to auto-derive from size. */
  curve?: number;
  segmentsH?: SegValue;
  segmentsV?: SegValue;
  fillColor?: string;
  className?: string;
  style?: CSSProperties;
  /** Render an inline-block wrapper instead of block. */
  inline?: boolean;
  /** Element role passthrough (e.g. 'group'). */
  as?: 'div' | 'span';
}

/**
 * Wrap children with an absolutely-positioned dashed hand-drawn border that
 * tracks the wrapper's size via ResizeObserver.
 */
export function HandDrawnDashedSurface({
  children,
  R = 16,
  seed = 3,
  mag,
  state = 'idle',
  strokeColor,
  strokeWidth = INK,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  dashArray,
  curve,
  segmentsH,
  segmentsV,
  fillColor,
  className,
  style,
  inline,
  as = 'div',
}: HandDrawnDashedSurfaceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 240, 80);
  const Tag = as;

  const resolvedStroke =
    strokeColor ??
    (state === 'focus'
      ? 'var(--field-border-focus)'
      : state === 'hover'
      ? 'var(--field-border-hover)'
      : 'var(--field-border)');

  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement & HTMLSpanElement>}
      className={[styles.surface, inline ? styles.inline : '', className].filter(Boolean).join(' ')}
      data-state={state}
      style={style}
    >
      <HandDrawnDashedBorder
        w={w}
        h={h}
        R={R}
        seed={seed}
        mag={mag}
        strokeColor={resolvedStroke}
        strokeWidth={strokeWidth}
        curve={curve}
        segmentsH={segmentsH}
        segmentsV={segmentsV}
        fillColor={fillColor}
      />
      <span className={styles.content}>{children}</span>
    </Tag>
  );
}
