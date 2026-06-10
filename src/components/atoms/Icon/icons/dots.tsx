import type { IconRenderProps } from '../types';

// Three hand-inked dots in a row — the "more actions" affordance. Each dot is
// a tiny closed bezier blob (not a perfect circle) so they read as pen presses.
export function DotsIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M5.2,11.8 C5.5,11.1 6.4,11.0 6.8,11.6 C7.2,12.2 6.7,13.0 6.0,12.9 C5.4,12.9 5.0,12.4 5.2,11.8 Z" fill={color} />
      <path d="M11.2,11.9 C11.4,11.1 12.4,11.0 12.8,11.6 C13.2,12.3 12.6,13.0 11.9,12.9 C11.4,12.8 11.1,12.4 11.2,11.9 Z" fill={color} />
      <path d="M17.2,11.8 C17.5,11.1 18.5,11.1 18.8,11.7 C19.1,12.3 18.6,13.0 17.9,12.9 C17.4,12.8 17.1,12.3 17.2,11.8 Z" fill={color} />
    </svg>
  );
}
