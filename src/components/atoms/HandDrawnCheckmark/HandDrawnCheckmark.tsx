'use client';

import { CSSProperties } from 'react';

export interface HandDrawnCheckmarkProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
  title?: string;
  style?: CSSProperties;
}

export function HandDrawnCheckmark({
  size = 14,
  color = 'var(--color-sage, oklch(55% 0.13 140))',
  strokeWidth = 1.8,
  title = 'Verified',
  style,
}: HandDrawnCheckmarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      role="img"
      aria-label={title}
      style={{ display: 'inline-block', verticalAlign: 'middle', ...style }}
    >
      <title>{title}</title>
      <path
        d="M2.2 8.4 C 3.3 8.8, 4.6 10.2, 5.9 12.0 C 7.4 9.2, 9.6 5.4, 13.6 2.9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
