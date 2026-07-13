import type { IconRenderProps } from '../types';

// Hand-drawn sheet of paper with a dog-eared top corner and three text lines,
// each stroke kept a little wavy so it reads as sketched, not printed.
export function DocumentIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* page outline with the corner folded in at the top-right */}
      <path d="M6.6,3.7 C9.9,3.6 12.5,3.6 13.9,3.7 L18.4,8.2 C18.5,12.0 18.5,16.6 18.4,20.3 C14.2,20.4 9.8,20.4 6.6,20.3 C6.5,14.9 6.5,9.1 6.6,3.7 Z" />
      {/* dog-ear fold */}
      <path d="M13.9,3.7 C13.8,5.2 13.9,6.9 14.0,8.0 C15.3,8.1 16.9,8.1 18.4,8.2" />
      {/* three text lines, gently uneven */}
      <path d="M9.2,12.2 C11.4,12.1 13.8,12.1 15.8,12.2" />
      <path d="M9.2,14.9 C11.4,14.8 13.8,14.8 15.8,14.9" />
      <path d="M9.2,17.6 C10.6,17.5 12.2,17.5 13.4,17.6" />
    </svg>
  );
}
