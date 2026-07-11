import type { IconRenderProps } from '../types';

// One head/shoulder silhouette with a small tick tucked at its side — the
// "connected person" mark. All wobbly beziers, matching the users icon.
export function UserCheckIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* head */}
      <path d="M8.3,4.6 C10.2,4.0 12.4,4.9 12.9,6.8 C13.3,8.6 12.3,10.6 10.5,11.0 C8.7,11.4 6.8,10.3 6.5,8.5 C6.3,6.8 7.0,5.1 8.3,4.6 Z" />
      {/* shoulders — wobbly bowed arc */}
      <path d="M3.4,19.3 C4.2,16.6 6.1,14.8 9.6,14.6 C11.6,14.5 13.2,15.1 14.3,16.1" />
      {/* tick beside the shoulder */}
      <path d="M15.2,17.4 C16.2,17.6 17.0,18.6 17.9,19.9 C19.3,17.8 20.8,15.9 22.5,14.3" strokeWidth={strokeWidth * 1.1} />
    </svg>
  );
}
