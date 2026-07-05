import type { IconRenderProps } from '../types';

// A ribbon bookmark — the quiet, private "keep this" gesture.
// The shape inherits `currentColor` for its stroke; pass `fill` (e.g.
// 'currentColor') to render the solid, active state.
export function BookmarkIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor', fill }: IconRenderProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ?? 'none'}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <path d="M6.6,3.9 C10.1,3.6 13.8,3.6 17.3,3.8 C17.6,9.2 17.5,14.7 17.4,20.1 C15.6,18.6 13.8,17.1 12.0,15.7 C10.2,17.2 8.4,18.6 6.6,20.0 C6.4,14.7 6.4,9.3 6.6,3.9 Z" />
    </svg>
  );
}
