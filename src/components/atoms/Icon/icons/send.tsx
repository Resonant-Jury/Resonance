import type { IconRenderProps } from '../types';

// A paper plane nosing up-right — "send", in one hand: the body in a single
// stroke from the tail round the nose and back in by the fold, every edge
// bowed (the top one easing straight into a sharp nose, the long one with a
// belly), the pen overrunning where the tail closes; the fold its own flick
// from the nose that stops just short of the fold, as the link glyph leaves
// its gaps. Nothing mirrored. It sits optically centred — halfway between the
// ink's box and the body's centre of mass is (12, 12) (send.test.ts) — so a
// button centres it as it is, with no nudge.
export function SendIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* the body: tail → nose → the low wing's tip → in to the fold → back past the tail */}
      <path d="M3.0,11.6 C7.9,8.7 15.0,5.9 20.2,3.8 C18.3,9.1 16.0,15.5 13.1,21.3 C11.6,18.5 10.8,16.2 9.9,14.3 C7.7,13.8 4.8,12.6 2.3,11.4" />
      {/* the fold, flicked from the nose and lifted before it reaches the fold */}
      <path d="M19.6,4.4 C17.2,7.2 14.4,10.0 11.7,12.4" />
    </svg>
  );
}
