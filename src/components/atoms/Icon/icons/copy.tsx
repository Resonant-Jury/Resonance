import type { IconRenderProps } from '../types';

// Two sheets, one over the other — "copy": the back sheet's corner peeking up
// and right behind a bowed front sheet, as the cards glyph stacks its cards.
export function CopyIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* the back sheet, only where it shows */}
      <path d="M9.2,6.5 C9.2,5.6 9.4,4.8 9.8,4.2 C12.8,3.9 16.2,4.0 19.3,4.4 C19.7,7.6 19.6,11.2 19.3,14.4 C18.7,14.7 18.0,14.8 17.2,14.8" />
      {/* the front sheet */}
      <path d="M4.8,8.1 C8.0,7.6 11.6,7.7 14.6,8.2 C15.0,11.6 14.9,15.7 14.6,19.5 C11.3,20.0 7.8,19.9 4.9,19.5 C4.4,15.8 4.6,11.7 4.8,8.1 Z" />
    </svg>
  );
}
