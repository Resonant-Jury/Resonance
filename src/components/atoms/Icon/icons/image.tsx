import type { IconRenderProps } from '../types';

// Wobbly photo frame, bowed horizon, small sun.
export function ImageIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* outer frame as one continuous bowed path */}
      <path d="M4.4,6.0 C8.0,4.8 14.6,5.0 19.5,5.7 C20.0,9.5 19.2,14.4 19.7,18.3 C15.3,19.0 8.6,18.7 4.5,18.4 C4.0,14.7 4.7,9.5 4.4,6.0 Z" />
      {/* mountain ridges inside, bowed peaks */}
      <path d="M4.6,17.6 C7.0,14.4 8.6,12.6 10.8,12.5 C13.1,12.5 15.5,15.0 19.4,17.5" />
      <path d="M12.5,17.8 C13.9,16.0 14.7,14.7 16.0,14.7 C17.3,14.7 18.4,15.7 19.4,16.7" />
      {/* sun — small wobbly closed bezier */}
      <path d="M8.7,9.2 C9.7,9.0 10.5,9.6 10.5,10.3 C10.4,11.0 9.5,11.4 8.7,11.2 C7.9,11.0 7.7,10.0 8.0,9.5 C8.2,9.3 8.5,9.2 8.7,9.2 Z" />
    </svg>
  );
}
