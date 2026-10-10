import type { IconRenderProps } from '../types';

// A paper plane nosing up-right — "send", in one hand: the body in a single
// stroke from the tail round the nose and back in by the fold, every edge
// bowed (the top one easing straight into a sharp nose, the long one with a
// belly), the pen running on past the tail where it closes, so the two
// strokes cross there as a quick hand's do; the fold its own bowed flick from
// the nose that stops just short of the fold, as the link glyph leaves its
// gaps. Nothing mirrored. It sits optically centred — halfway between the
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
      <path d="M3.0,12.4 C7.2,9.3 13.9,6.3 20.2,3.5 C18.7,8.8 16.4,15.2 12.9,21.3 C11.8,19.0 10.9,16.7 9.7,14.5 C7.2,13.7 4.2,12.3 1.7,11.0" />
      {/* the fold, flicked from the nose and lifted before it reaches the fold */}
      <path d="M19.6,4.2 C16.3,6.3 14.2,9.4 11.4,12.1" />
    </svg>
  );
}
