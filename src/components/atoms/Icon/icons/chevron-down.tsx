import type { IconRenderProps } from '../types';

// Hand-drawn chevron — a single bowed "v" stroke, slightly uneven arms.
export function ChevronDownIcon({
  size = 22,
  strokeWidth = 1.6,
  color = 'currentColor',
}: IconRenderProps) {
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
      <path d="M5.4,9.2 C8.0,11.6 10.0,14.2 11.9,15.6 C13.9,14.0 16.1,11.4 18.7,9.4" />
    </svg>
  );
}
