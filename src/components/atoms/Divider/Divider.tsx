'use client';

import { useMemo, useRef } from 'react';
import { wavyLine, wavyVertical } from '@/lib/design/wavyPath';
import { useElementSize } from '@/lib/hooks/useElementSize';

// One wobble turn per ~this many px of rendered height, so a taller quote
// gets proportionally more turns instead of a fixed count stretched out.
const PX_PER_STEP = 34;

export interface DividerProps {
  /** Both orientations render a wavy hand-drawn line. */
  orientation?: 'horizontal' | 'vertical';
  /** Used for seed so each instance gets unique wobble. */
  seed?: number;
  amplitude?: number;
  steps?: number;
  strokeWidth?: number;
  color?: string;
  /** Vertical margin around the divider. */
  spacing?: number | string;
  /** Make horizontal width less than 100%. */
  width?: number | string;
}

/**
 * Visual separator between sections inside a Panel — the preferred
 * alternative to nesting a card-inside-a-card.
 */
export function Divider({
  orientation = 'horizontal',
  seed = 17,
  amplitude = 1.4,
  steps = 7,
  strokeWidth = 1.2,
  color = 'oklch(60% 0.04 60 / 0.35)',
  spacing = 'clamp(4px, 0.8vw, 8px)',
  width = '100%',
}: DividerProps) {
  const W = 240;
  const isVertical = orientation === 'vertical';
  // Fraction trimmed off each end so the rule floats in the middle of the
  // panel rather than touching its top/bottom (or left/right) edges.
  const INSET = 0.18;

  // Vertical rules derive their turn count from the rendered height, so a
  // longer quote gets more turns at a constant density rather than the same
  // fixed count stretched thinner. Falls back to `steps` until measured (and
  // for horizontal rules, which keep their explicit count).
  const ref = useRef<HTMLDivElement>(null);
  const { h: measuredH, measured } = useElementSize(ref);
  const effectiveSteps =
    isVertical && measured
      ? Math.max(2, Math.round((measuredH * (1 - INSET * 2)) / PX_PER_STEP))
      : steps;

  const d = useMemo(
    () =>
      isVertical
        ? wavyVertical(W * (1 - INSET * 2), seed, amplitude, effectiveSteps)
        : wavyLine(W, seed, amplitude, effectiveSteps),
    [isVertical, seed, amplitude, effectiveSteps]
  );
  const h = amplitude * 2 + strokeWidth * 2;

  if (isVertical) {
    return (
      <div
        ref={ref}
        aria-hidden
        style={{
          position: 'relative',
          width: h,
          alignSelf: 'stretch',
          margin: `0 ${typeof spacing === 'number' ? `${spacing}px` : spacing}`,
          lineHeight: 0,
        }}
      >
        {/* Absolutely positioned so the SVG fills the flex-stretched height
            without its viewBox aspect-ratio inflating the row. */}
        <svg
          viewBox={`${-h / 2} 0 ${h} ${W}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
        >
          <path
            d={d}
            transform={`translate(0, ${W * INSET})`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
    );
  }

  return (
    <div
      aria-hidden
      style={{
        width,
        margin: `${typeof spacing === 'number' ? `${spacing}px` : spacing} auto`,
        lineHeight: 0,
      }}
    >
      <svg
        viewBox={`0 ${-h / 2} ${W} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={h}
        style={{ display: 'block', overflow: 'visible' }}
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
