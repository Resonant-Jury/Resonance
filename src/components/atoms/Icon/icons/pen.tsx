import type { IconRenderProps } from '../types';

// A hand-drawn fountain pen / nib on a baseline — "write a card".
export function PenIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* pen barrel */}
      <path d="M15.6,3.7 C16.4,2.9 17.7,2.9 18.5,3.7 L20.3,5.5 C21.1,6.3 21.1,7.6 20.3,8.4 L9.6,19.1 C9.4,19.3 9.1,19.5 8.8,19.6 L5.0,20.9 C4.4,21.1 3.9,20.6 4.1,20.0 L5.4,16.2 C5.5,15.9 5.7,15.6 5.9,15.4 Z" />
      {/* nib slit */}
      <path d="M5.3,16.4 C6.6,16.9 7.9,18.2 8.5,19.6" />
      {/* collar */}
      <path d="M14.0,5.3 L18.7,10.0" />
    </svg>
  );
}
