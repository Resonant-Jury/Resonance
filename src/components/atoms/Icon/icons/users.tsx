import type { IconRenderProps } from '../types';

// Two overlapping head/shoulder silhouettes, all bezier (no circles).
export function UsersIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* secondary head (behind) */}
      <path d="M15.4,7.8 C16.7,7.4 18.2,8.0 18.6,9.4 C19.0,10.7 18.4,12.1 17.2,12.5 C16.0,12.9 14.6,12.3 14.3,11.0 C14.0,9.7 14.4,8.3 15.4,7.8 Z" />
      {/* secondary shoulders */}
      <path d="M14.6,14.7 C16.0,14.0 18.3,14.4 19.6,15.7 C20.6,16.7 20.9,17.9 21.0,18.4" />
      {/* primary head */}
      <path d="M7.5,6.3 C9.4,5.7 11.6,6.6 12.1,8.5 C12.5,10.3 11.5,12.3 9.7,12.7 C7.9,13.1 6.0,12.0 5.7,10.2 C5.5,8.5 6.2,6.8 7.5,6.3 Z" />
      {/* primary shoulders — wobbly bowed arc */}
      <path d="M3.1,18.9 C3.9,16.5 5.7,14.7 9.1,14.5 C12.4,14.3 14.5,16.3 15.1,18.9" />
    </svg>
  );
}
