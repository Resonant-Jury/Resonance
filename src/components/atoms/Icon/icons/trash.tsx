import type { IconRenderProps } from '../types';

// A hand-drawn waste bin — slightly tapered body, loose lid with a small
// handle, and two inner strokes suggesting the slats.
export function TrashIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* lid */}
      <path d="M4.6,7.0 C9.4,6.4 14.8,6.4 19.4,7.1" />
      {/* handle */}
      <path d="M9.6,6.6 C9.5,5.3 10.1,4.5 12.0,4.5 C13.8,4.5 14.5,5.2 14.4,6.6" />
      {/* tapered body */}
      <path d="M6.2,7.2 C6.4,11.4 6.8,15.8 7.4,19.0 C8.1,19.8 15.8,19.9 16.6,19.1 C17.2,15.7 17.6,11.3 17.8,7.3" />
      {/* slats */}
      <path d="M10.2,9.8 C10.3,12.2 10.4,14.5 10.6,16.6" />
      <path d="M13.8,9.7 C13.7,12.1 13.6,14.5 13.4,16.7" />
    </svg>
  );
}
