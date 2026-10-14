import type { IconRenderProps } from '../types';

// Hand-drawn person: a lopsided head loop, fuller on one side, whose pen runs
// on past where it started, over shoulders drawn in one uneven sweep — the
// left one rounder and lower, the right one lifting off with a small flick.
export function UserIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* head: an uneven loop around (12,8), its pen running on past the start */}
      <path d="M11.2,4.4 C13.5,3.6 16.0,5.2 15.9,7.9 C15.8,10.1 14.1,11.7 11.8,11.5 C9.6,11.4 8.0,9.8 8.2,7.5 C8.4,5.5 10.0,4.0 12.1,4.1 C12.9,4.2 13.5,4.6 13.9,5.2" />
      {/* shoulders: one uneven sweep, the right end flicking up */}
      <path d="M4.7,19.9 C4.3,17.6 5.6,15.8 7.6,14.9 C9.0,14.3 10.5,14.1 12.3,14.2 C15.4,14.3 18.4,15.7 19.1,18.6 C19.2,19.2 19.3,19.7 19.0,20.2" />
    </svg>
  );
}
