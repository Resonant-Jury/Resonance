import type { IconRenderProps } from '../types';

// A loose dashed enclosure with a small card inside — "gather into a group".
export function FrameIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M4.2,4.6 C7.1,4.1 10.4,4.4 12.9,4.2" />
      <path d="M16.8,4.3 C18.2,4.2 19.5,4.5 19.7,5.9 C19.8,7 19.6,8.4 19.7,9.6" />
      <path d="M19.8,13.4 C19.9,15.4 19.6,17.6 19.7,19.4 C17.7,19.7 15.4,19.4 13.4,19.6" />
      <path d="M9.6,19.7 C8,19.6 6,19.9 4.7,19.5 C4.1,19.3 4.3,17.7 4.3,16.6" />
      <path d="M4.3,12.8 C4.2,11.1 4.4,7.9 4.3,8.2" />
      <path d="M8.6,9.4 C10.7,9 13.5,9.3 15.3,9.2 C15.6,11 15.3,13.2 15.4,14.9 C13.3,15.2 10.7,14.9 8.7,15.1 C8.5,13.2 8.7,11.2 8.6,9.4 Z" />
    </svg>
  );
}
