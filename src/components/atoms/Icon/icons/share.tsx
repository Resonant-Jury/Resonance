import type { IconRenderProps } from '../types';

// An open-topped tray with an arrow lifting out of it — "share", drawn in one
// hand: nothing mirrored, the pen overrunning where it turns. Used by the
// native apps' card page (the platform share sheet).
export function ShareIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* tray, open at the top — the sides unequal, the right lip's stroke running on past where it turns in */}
      <path d="M8.7,9.6 C7.0,9.5 5.7,9.9 4.7,10.8 C4.4,13.6 4.5,16.8 5.4,19.9 C8.2,20.6 11.6,20.3 14.2,20.1 C15.9,20.0 17.5,19.9 18.8,19.2 C19.5,16.3 19.6,13.3 19.2,10.5 C18.4,9.9 17.1,9.7 15.4,10.0 C15.1,10.0 14.9,10.1 14.7,10.2" />
      {/* arrow shaft lifting out, leaning a little as a hand's does */}
      <path d="M11.9,16.2 C12.4,13.1 11.5,9.7 12.2,6.4 C12.4,5.4 12.3,4.4 12.4,3.4" />
      {/* arrowhead in one flick, the wings unequal */}
      <path d="M8.3,7.9 C9.8,6.3 11.1,4.9 12.5,3.1 C13.5,4.3 14.8,5.6 16.3,6.6" />
    </svg>
  );
}
