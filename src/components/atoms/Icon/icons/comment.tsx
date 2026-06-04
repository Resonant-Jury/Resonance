import type { IconRenderProps } from '../types';

// A hand-drawn speech bubble with a little tail — "leave a comment".
export function CommentIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* bubble body with a downward tail at the lower-left */}
      <path d="M4.1,6.0 C4.3,4.6 5.5,3.7 6.9,3.7 L17.2,3.7 C18.7,3.6 20.0,4.8 20.0,6.3 L20.0,13.0 C20.1,14.5 18.8,15.7 17.3,15.7 L9.6,15.7 L6.0,19.4 C5.7,19.7 5.2,19.5 5.2,19.0 L5.3,15.6 C4.5,15.3 4.0,14.5 4.0,13.6 Z" />
      {/* two text lines */}
      <path d="M7.6,8.0 C9.8,8.3 13.8,7.9 16.4,8.1" />
      <path d="M7.6,11.3 C9.4,11.6 11.9,11.2 13.7,11.4" />
    </svg>
  );
}
