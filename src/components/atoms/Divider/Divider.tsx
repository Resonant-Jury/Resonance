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
  // Derived from the field-border token (not a hardcoded oklch) so the rule
  // follows the TweaksPanel accent themes instead of staying warm-brown.
  color = 'color-mix(in oklch, var(--field-border-hover) 35%, transparent)',
  spacing = 'clamp(4px, 0.8vw, 8px)',
  width = '100%',
}: DividerProps) {
  const W = 240;
  const isVertical = orientation === 'vertical';
  // Fraction trimmed off each end so the rule floats in the middle of the
  // panel rather than touching its top/bottom (or left/right) edges. Once a
  // vertical rule is measured the trim is capped to a few real pixels —
  // otherwise a tall quote would lose 18% of its height at *each* end and the
  // curve would read far shorter than the text beside it.
  const INSET = 0.18;
  const INSET_MAX_PX = 6;

  // Vertical rules derive their turn count from the rendered height, so a
  // longer quote gets more turns at a constant density rather than the same
  // fixed count stretched thinner. Falls back to `steps` until measured (and
  // for horizontal rules, which keep their explicit count).
  const ref = useRef<HTMLDivElement>(null);
  const { h: measuredH, measured } = useElementSize(ref);
  const inset =
    isVertical && measured ? Math.min(INSET, INSET_MAX_PX / Math.max(measuredH, 1)) : INSET;
  const effectiveSteps =
    isVertical && measured
      ? Math.max(2, Math.round((measuredH * (1 - inset * 2)) / PX_PER_STEP))
      : steps;

  const d = useMemo(
    () =>
      isVertical
        ? wavyVertical(W * (1 - inset * 2), seed, amplitude, effectiveSteps)
        : wavyLine(W, seed, amplitude, effectiveSteps),
    [isVertical, seed, amplitude, effectiveSteps, inset]
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
            transform={`translate(0, ${W * inset})`}
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
