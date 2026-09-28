import type { IconRenderProps } from '../types';

// An open-topped tray with an arrow lifting out of it — "share". Used by the
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
      {/* tray, open at the top */}
      <path d="M8.3,10.3 C6.8,10.2 5.6,10.4 5.0,10.8 C4.6,13.8 4.7,17.1 5.0,19.6 C9.4,20.1 14.7,20.0 19.0,19.6 C19.4,16.9 19.4,13.7 19.1,10.8 C18.5,10.4 17.3,10.2 15.8,10.3" />
      {/* arrow shaft lifting out */}
      <path d="M12.1,15.3 C11.8,11.6 12.3,7.6 11.9,3.7" />
      {/* arrowhead */}
      <path d="M8.5,7.1 C9.8,5.8 11.0,4.6 11.9,3.6 C13.0,4.7 14.2,5.9 15.6,7.0" />
    </svg>
  );
}
