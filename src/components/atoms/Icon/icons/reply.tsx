import type { IconRenderProps } from '../types';

// An arrow turning back on itself — "reply": the shaft rising from the lower
// right and bending left, the head one bowed flick, as the arrow-right glyph's.
export function ReplyIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M19.7,18.7 C19.9,14.7 18.4,11.5 14.7,10.5 C12.4,9.9 9.6,9.9 5.6,10.1" />
      <path d="M9.6,5.6 C8.1,7.2 6.6,8.6 5.1,10.1 C6.6,11.7 8.1,13.1 9.8,14.7" />
    </svg>
  );
}
