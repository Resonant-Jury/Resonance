import type { IconRenderProps } from '../types';

// Two bowed diagonals — the canonical hand-drawn X.
export function CloseIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M5.2,5.4 C9.2,8.4 15.6,9.5 18.4,18.5" />
      <path d="M18.5,5.3 C15.4,9.2 9.4,13.5 5.4,18.3" />
    </svg>
  );
}
