import type { IconRenderProps } from '../types';

// Hand-drawn key: a lopsided bow ring up top whose loop overshoots its start,
// with the shaft dropping straight down and two teeth notched off to the side.
export function KeyIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* bow: uneven ring around (12,7), pen crossing itself at the close */}
      <path d="M11.6,3.95 C13.5,3.8 15.2,5.2 15.3,7.05 C15.4,8.95 14.0,10.5 12.1,10.5 C10.2,10.6 8.7,9.05 8.7,7.15 C8.7,5.4 10.0,4.0 11.7,4.0 C12.2,4.0 12.7,4.1 13.1,4.3" />
      {/* shaft + teeth: one continuous downward stroke, two notches to the right */}
      <path d="M12,10.5 L12.1,19.4" />
      <path d="M12.05,15.4 L14.7,15.4" />
      <path d="M12.1,18.0 L13.9,18.0" />
    </svg>
  );
}
