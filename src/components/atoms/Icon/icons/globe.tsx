import type { IconRenderProps } from '../types';

// Wobbly globe — closed bezier loop + bowed equator + bowed meridian.
export function GlobeIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* outer sphere as one closed wobbly bezier loop */}
      <path d="M11.9,3.5 C16.4,3.7 20.4,7.6 20.4,12.1 C20.5,16.7 16.5,20.4 12.0,20.4 C7.4,20.5 3.5,16.4 3.5,11.9 C3.6,7.4 7.6,3.6 11.9,3.5 Z" />
      {/* bowed equator (slight downward bow then up) */}
      <path d="M3.7,12.1 C8.0,13.5 15.7,10.6 20.3,12.0" />
      {/* bowed meridian (figure-eight-style closed) */}
      <path d="M12.0,3.6 C9.4,6.5 8.9,17.4 12.1,20.4 C15.2,17.7 14.9,6.4 12.0,3.6 Z" />
    </svg>
  );
}
