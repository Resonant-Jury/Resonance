import type { IconRenderProps } from '../types';

// A double-headed horizontal arrow (←→): a gently bowed shaft with a
// continuous hand-drawn arrowhead at each end. Reads as "drag me left/right",
// so it fits the resize grip riding on the pane boundary.
export function ArrowsHorizontalIcon({
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
      {/* Bowed shaft spanning both heads. */}
      <path d="M5.0,12.2 C9.0,10.9 15.0,13.1 19.0,11.8" />
      {/* Left head: one pen stroke top-barb → tip → bottom-barb. */}
      <path d="M8.4,8.3 C6.9,9.6 5.6,10.9 4.8,12.0 C5.6,13.2 6.8,14.4 8.3,15.7" />
      {/* Right head. */}
      <path d="M15.6,8.3 C17.1,9.6 18.4,10.9 19.2,12.0 C18.4,13.2 17.2,14.4 15.7,15.7" />
    </svg>
  );
}
