import type { IconRenderProps } from '../types';

// Two sheets, one over the other — "copy": the back sheet's corner peeking up
// and right behind a bowed front sheet, as the cards glyph stacks its cards.
// Drawn as a hand would at a small size: the front sheet in one stroke that
// starts just past its top-left corner and comes up the left side past it
// again (the pen overrunning, as share's tray does), every side bowed its own
// way; the back sheet's top falling a little to the right, so the two never
// sit square with each other.
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
      <path d="M9.0,5.7 C9.0,5.0 9.3,4.4 9.8,3.9 C13.0,3.4 16.4,3.6 19.6,4.2 C20.0,7.6 19.9,11.1 19.5,14.6 C18.9,14.9 18.2,15.0 17.5,15.0" />
      {/* the front sheet: along the top, down, back along the foot and up past where it began */}
      <path d="M5.7,7.9 C8.7,7.4 11.9,7.3 14.9,7.7 C15.5,11.3 15.6,15.4 15.0,19.6 C11.6,20.3 7.7,20.2 4.4,19.6 C4.0,15.6 4.1,11.3 4.6,7.6 C4.7,6.9 4.8,6.3 5.0,5.8" />
    </svg>
  );
}
