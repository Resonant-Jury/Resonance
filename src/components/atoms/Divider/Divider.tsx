'use client';

import { useMemo } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';

export interface DividerProps {
  /** Horizontal: wavy line. Vertical: thin straight rule. */
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
  if (orientation === 'vertical') {
    return (
      <div
        aria-hidden
        style={{
          width: 1,
          alignSelf: 'stretch',
          background: color,
          margin: `0 ${typeof spacing === 'number' ? `${spacing}px` : spacing}`,
        }}
      />
    );
  }

  const W = 240;
  const d = useMemo(() => wavyLine(W, seed, amplitude, steps), [seed, amplitude, steps]);
  const h = amplitude * 2 + strokeWidth * 2;

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
