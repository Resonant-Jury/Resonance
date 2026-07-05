import type { IconRenderProps } from '../types';

// A hand-drawn speech bubble with a soft tail — the private conversation
// (私訊) between two connected people.
export function ChatIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      <path d="M4.2,5.9 C9.4,5.5 14.9,5.5 20.0,5.9 C20.4,9.2 20.3,12.5 20.0,15.7 C16.3,16.1 12.5,16.2 8.8,16.0 C7.4,17.5 5.9,18.9 4.4,20.2 C4.3,15.4 4.1,10.7 4.2,5.9 Z" />
      <path d="M8.3,9.8 C10.9,9.6 13.5,9.6 16.0,9.8" />
      <path d="M8.4,12.4 C10.3,12.3 12.2,12.3 14.1,12.4" />
    </svg>
  );
}
