import type { IconRenderProps } from '../types';

// 5-point star — every edge a strongly bowed cubic, uneven arm lengths, and a
// pen that overshoots its own start point. Reads hand-sketched, not stamped.
export function StarIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M11.7,2.9 C12.7,5.0 13.0,7.6 14.2,9.1 C16.3,9.0 18.9,9.2 20.8,9.8 C19.3,11.6 16.9,12.4 15.7,14.4 C16.4,16.5 16.6,18.8 17.5,20.8 C15.6,19.2 13.5,18.1 11.8,16.8 C9.8,17.8 8.0,19.7 6.2,20.6 C7.1,18.4 7.6,16.0 8.0,14.2 C6.6,12.7 4.5,11.5 3.1,9.7 C5.3,9.1 7.6,9.4 9.6,9.0 C10.4,7.0 10.7,4.7 12.0,2.7" />
    </svg>
  );
}
