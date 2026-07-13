import type { IconRenderProps } from '../types';

// Hand-drawn person: a slightly lopsided head loop that overshoots where the
// pen crossed itself, over a shoulders arc drawn in one bowed sweep.
export function UserIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* head: uneven loop around (12,8), closing with a small overshoot */}
      <path d="M11.7,4.1 C13.7,3.9 15.4,5.4 15.5,7.4 C15.6,9.5 14.0,11.2 11.9,11.2 C9.9,11.3 8.3,9.7 8.3,7.7 C8.3,5.8 9.8,4.2 11.6,4.1 C12.1,4.1 12.6,4.2 13.0,4.4" />
      {/* shoulders: one bowed arc, ends kicked up a touch unevenly */}
      <path d="M4.9,20.0 C4.9,16.4 8.0,14.4 12.0,14.4 C16.1,14.4 19.2,16.5 19.1,20.1" />
    </svg>
  );
}
