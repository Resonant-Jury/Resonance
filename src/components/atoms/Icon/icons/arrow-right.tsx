import type { IconRenderProps } from '../types';

// Bowed shaft with two bowed arrowhead strokes.
export function ArrowRightIcon({
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
      <path d="M4.3,11.9 C8.4,13.6 14.7,10.4 18.9,12.2" />
      <path d="M13.2,6.6 C15.6,8.2 17.7,10.5 18.9,12.1" />
      <path d="M18.9,12.0 C17.0,13.9 15.3,15.6 13.3,17.3" />
    </svg>
  );
}
