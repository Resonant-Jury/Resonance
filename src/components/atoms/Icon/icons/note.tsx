import type { IconRenderProps } from '../types';

// A little envelope — the private note (小紙條) to an author.
export function NoteIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M3.6,6.4 C9.2,6.1 14.9,6.1 20.4,6.3 C20.7,10.1 20.6,14.0 20.4,17.7 C14.8,18.0 9.1,17.9 3.7,17.6 C3.4,13.9 3.4,10.1 3.6,6.4 Z" />
      <path d="M3.9,6.9 C6.6,9.2 9.3,11.4 12.1,13.4 C14.8,11.3 17.5,9.1 20.1,6.8" />
    </svg>
  );
}
