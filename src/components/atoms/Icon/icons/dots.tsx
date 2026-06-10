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
      {/* Three hand-drawn wobbly circular strokes with slight overshoots/overlapping tails */}
      <path d="M4.6,12.0 C4.5,10.6 5.3,9.7 6.2,9.6 C7.2,9.5 8.1,10.4 8.0,11.8 C7.9,13.2 7.0,14.1 6.0,14.0 C5.0,13.9 4.3,12.8 4.7,11.3" />
      <path d="M10.8,11.8 C10.7,10.3 11.4,9.6 12.4,9.7 C13.4,9.8 14.2,10.7 14.1,12.1 C14.0,13.5 13.1,14.2 12.1,14.1 C11.1,14.0 10.5,12.9 10.9,11.4" />
      <path d="M16.5,12.4 C16.4,11.0 17.2,10.1 18.2,10.0 C19.2,9.9 20.1,10.8 20.0,12.2 C19.9,13.6 19.0,14.5 18.0,14.4 C17.0,14.3 16.3,13.2 16.7,11.7" />
    </svg>
  );
}
