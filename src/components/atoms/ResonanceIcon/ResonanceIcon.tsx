'use client';

import { CSSProperties, useEffect, useState } from 'react';

function useAccentColor() {
  const [color, setColor] = useState('#6F8F72');
  useEffect(() => {
    const read = () => {
      const val = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-terracotta')
        .trim();
      if (val) setColor(val);
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    return () => mo.disconnect();
  }, []);
  return color;
}

export interface ResonanceIconProps {
  size?: number;
  style?: CSSProperties;
}

/**
 * The brand mark: the same three stacked rippling waves as the「共振」action
 * icon (atoms/Icon/icons/wave.tsx) — resonance spreading outward — drawn in
 * the live accent color so it follows the TweaksPanel theme.
 */
export function ResonanceIcon({ size = 32, style = {} }: ResonanceIconProps) {
  const accent = useAccentColor();
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={accent}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      // The wordmark's visual mass sits below the line's geometric center, so
      // the flex-centered mark reads as floating high; a size-relative nudge
      // (transform — no layout shift) rebalances every brand lockup at once.
      style={{ display: 'block', flexShrink: 0, transform: 'translateY(7%)', ...style }}
    >
      <path d="M3.4,8.2 C5.4,5.9 7.3,5.8 9.2,8.0 C11.1,10.2 13.0,10.3 15.0,8.1 C16.9,6.0 18.8,5.9 20.7,8.1" />
      <path d="M3.0,12.1 C5.1,9.7 7.1,9.8 9.0,12.0 C10.9,14.2 12.9,14.3 14.9,12.1 C16.8,9.9 18.8,9.8 20.9,12.0" />
      <path d="M3.5,16.0 C5.4,13.8 7.4,13.7 9.3,15.9 C11.2,18.1 13.1,18.2 15.1,16.0 C17.0,13.9 18.9,13.8 20.8,16.0" />
    </svg>
  );
}
