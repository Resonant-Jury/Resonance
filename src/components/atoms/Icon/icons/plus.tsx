import type { IconRenderProps } from '../types';

// Plus with both strokes visibly bowed.
export function PlusIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M12.1,4.3 C10.6,8.7 13.4,14.6 11.9,19.6" />
      <path d="M4.4,11.8 C8.7,13.3 14.9,10.7 19.6,12.2" />
    </svg>
  );
}
