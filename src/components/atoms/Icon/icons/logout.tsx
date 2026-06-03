import type { IconRenderProps } from '../types';

// A hand-drawn doorway open on the right with an arrow stepping out through it —
// "sign out".
export function LogoutIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* door panel — left frame, open on the right */}
      <path d="M13.6,4.6 C10.2,4.1 7.2,4.3 5.6,5.0 C4.9,8.6 4.8,15.4 5.6,19.0 C7.2,19.7 10.2,19.9 13.6,19.4" />
      {/* arrow shaft stepping out */}
      <path d="M9.4,12.1 C12.6,11.8 16.4,12.3 19.6,12.0" />
      {/* arrowhead */}
      <path d="M16.4,8.9 C17.8,10.2 19.0,11.2 19.7,12.0 C18.8,13.1 17.7,14.3 16.3,15.4" />
    </svg>
  );
}
