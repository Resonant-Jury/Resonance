import type { IconRenderProps } from '../types';

// Hand-drawn magnifier, sketchy on purpose: the lens is a visibly lopsided
// loop whose end overshoots its start (the pen crossing itself the way a
// quick circle does), and the handle is a bowed stroke that kicks off at a
// slightly wrong angle.
export function SearchIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* lens: uneven loop, flat-ish top-left, bulging bottom, overshooting close */}
      <path d="M10.9,3.9 C13.5,3.4 16.2,5.3 17.0,7.9 C17.9,10.7 16.6,13.9 14.1,15.3 C11.6,16.7 8.2,16.2 6.3,14.0 C4.5,11.9 4.4,8.5 6.1,6.3 C7.3,4.8 9.0,4.0 10.7,4.0 C11.3,4.0 11.9,4.1 12.4,4.3" />
      {/* handle: starts a touch off the rim, bows down-right with a heavier hand */}
      <path d="M15.4,14.6 C16.4,15.4 17.3,16.5 18.2,17.5 C18.8,18.2 19.5,18.9 20.1,19.5" />
    </svg>
  );
}
