import type { IconRenderProps } from '../types';

// Single horizontal stroke, gently bowed — pairs with PlusIcon for zoom controls.
export function MinusIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M4.4,11.9 C8.8,13.2 15.1,10.8 19.6,12.1" />
    </svg>
  );
}
