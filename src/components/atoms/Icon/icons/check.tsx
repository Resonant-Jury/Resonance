import type { IconRenderProps } from '../types';

// Two-segment tick: short bowed up-left segment, longer bowed up-right.
export function CheckIcon({ size = 22, strokeWidth = 1.8, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M4.3,12.7 C6.4,13.1 8.1,15.1 10.2,17.8 C13.1,13.5 16.2,9.6 19.7,6.4" />
    </svg>
  );
}
