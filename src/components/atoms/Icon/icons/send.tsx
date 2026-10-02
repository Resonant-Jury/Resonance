import type { IconRenderProps } from '../types';

// A paper plane nosing up-right — "send", in one hand: the body in a single
// stroke from the tail round the nose and back in by the fold, the fold its
// own flick from the nose, the pen overrunning where the tail closes.
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
      <path d="M3.6,10.7 C8.9,8.4 14.6,5.9 20.4,3.6 C18.6,9.0 16.2,14.8 13.5,20.4 C12.4,18.1 11.4,15.8 10.4,13.5 C8.2,12.5 5.9,11.6 3.3,10.6" />
      {/* the fold, flicked from the nose */}
      <path d="M20.1,3.9 C16.9,7.0 13.7,10.2 10.7,13.2" />
    </svg>
  );
}
