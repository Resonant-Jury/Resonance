import type { IconRenderProps } from '../types';

// "→|": the arrow-right's bowed shaft and one-stroke head, run up against a
// slightly bowed upright — a pane folding away to the right (the thought
// map's editor pane), not ✕, which reads as "discard".
export function CollapseRightIcon({
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
      <path d="M3.4,12.1 C6.9,13.5 11.2,10.9 15.1,12.2" />
      <path d="M10.4,7.3 C12.3,8.8 14.1,10.6 15.2,12.1 C14.3,13.4 13.0,14.9 10.5,16.8" />
      <path d="M19.6,4.9 C19.2,9.4 19.8,14.6 19.3,19.2" />
    </svg>
  );
}
