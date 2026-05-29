import type { IconRenderProps } from '../types';

// Wobbly padlock: bowed shackle arch + closed-bezier body + dot keyhole.
export function LockIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* body — single wobbly rounded rect path */}
      <path d="M4.6,11.6 C8.4,10.8 15.7,11.0 19.3,11.4 C19.7,14.0 19.6,17.0 19.4,19.4 C15.4,20.1 8.6,19.8 4.7,19.3 C4.1,16.9 4.8,13.9 4.6,11.6 Z" />
      {/* shackle — bowed arch */}
      <path d="M7.6,11.5 C6.9,9.2 7.7,6.4 9.6,5.3 C11.5,4.2 13.7,4.5 15.0,5.9 C16.5,7.4 16.7,9.5 16.3,11.5" />
      {/* keyhole dot */}
      <path d="M11.6,14.3 C12.4,14.0 13.1,14.7 12.8,15.5 C12.6,16.0 12.6,16.6 12.4,17.0 C12.0,17.0 11.7,16.4 11.5,15.8 C11.3,15.2 11.2,14.6 11.6,14.3 Z" fill={color} stroke="none" />
    </svg>
  );
}
