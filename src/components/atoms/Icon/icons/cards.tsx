import type { IconRenderProps } from '../types';

// A small stack of hand-drawn cards — the back one peeking up-right behind a
// bowed front card with two faint text lines. Reads as "my card box".
export function CardsIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* back card edge poking out behind */}
      <path d="M9.0,4.6 C12.3,4.1 16.4,4.3 19.2,4.9 C19.7,7.9 19.5,11.4 19.2,14.2" />
      {/* front card — bowed rounded rectangle */}
      <path d="M4.6,8.2 C8.0,7.6 12.0,7.8 15.2,8.4 C15.7,11.4 15.5,15.6 15.1,19.3 C11.5,19.9 7.6,19.7 4.7,19.3 C4.2,15.8 4.9,11.6 4.6,8.2 Z" />
      {/* two text lines inside */}
      <path d="M6.8,11.8 C8.6,11.5 11.0,11.6 12.9,11.9" />
      <path d="M6.9,14.7 C8.4,14.5 10.2,14.5 11.6,14.7" />
    </svg>
  );
}
