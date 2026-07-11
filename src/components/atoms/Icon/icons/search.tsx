import type { IconRenderProps } from '../types';

// Hand-drawn magnifier: a visibly imperfect bezier ring with a short
// off-angle handle.
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
      {/* lens as a closed wobbly bezier loop */}
      <path d="M10.4,4.1 C13.8,3.7 16.7,6.2 17.0,9.5 C17.3,12.9 14.8,15.8 11.5,16.1 C8.1,16.4 5.2,14.0 4.9,10.6 C4.6,7.4 7.2,4.5 10.4,4.1 Z" />
      {/* handle, slightly bowed */}
      <path d="M15.7,14.9 C17.1,16.2 18.5,17.6 19.9,19.1" />
    </svg>
  );
}
