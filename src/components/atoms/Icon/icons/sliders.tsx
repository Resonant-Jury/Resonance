import type { IconRenderProps } from '../types';

// Two slider rails with a knob on each — "settings". The rails stop at the
// knobs' rims so the knobs read as rings threaded on the line.
export function SlidersIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* upper rail, knob to the left */}
      <path d="M4.2,7.9 C5.3,7.8 6.2,7.8 6.9,7.8" />
      <path d="M11.2,7.8 C14.0,7.6 17.3,8.0 19.8,7.7" />
      <path d="M9.1,5.7 C10.3,5.6 11.2,6.6 11.1,7.8 C11.1,9.0 10.1,9.9 8.9,9.9 C7.7,9.8 6.9,8.9 7.0,7.7 C7.0,6.6 7.9,5.8 9.1,5.7 Z" />
      {/* lower rail, knob to the right */}
      <path d="M4.3,16.3 C7.5,16.0 10.6,16.4 12.8,16.2" />
      <path d="M17.2,16.2 C18.1,16.2 19.0,16.1 19.7,16.3" />
      <path d="M15.0,14.1 C16.2,14.0 17.1,15.0 17.1,16.2 C17.1,17.4 16.1,18.3 14.9,18.3 C13.7,18.2 12.9,17.3 12.9,16.1 C13.0,15.0 13.9,14.2 15.0,14.1 Z" />
    </svg>
  );
}
