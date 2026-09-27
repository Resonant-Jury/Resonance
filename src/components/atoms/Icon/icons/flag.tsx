import type { IconRenderProps } from '../types';

// Report flag: a slightly leaning pole with a wavy cloth, drawn in one hand.
export function FlagIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* pole — a faint lean, not a ruler line */}
      <path d="M5.4,21.2 C5.3,15.6 5.1,9.4 5.3,3.4" />
      {/* cloth — two bowed waves meeting at the fly end */}
      <path d="M5.4,4.2 C7.9,2.9 10.2,3.6 12.3,4.6 C14.5,5.6 16.6,5.9 18.9,4.9 C18.4,7.6 18.6,10.1 19.1,12.4 C16.8,13.4 14.6,13.0 12.4,12.1 C10.2,11.2 7.9,10.6 5.5,11.9" />
    </svg>
  );
}
