import type { IconRenderProps } from '../types';

// Hand-drawn bell — wobbly dome, bowed rim, dot clapper.
export function BellIcon({ size = 22, strokeWidth = 1.6, color = 'currentColor' }: IconRenderProps) {
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
      {/* dome + sides + bowed bottom rim, all one wobbly closed loop */}
      <path d="M5.7,16.6 C5.4,12.4 6.4,9.5 7.6,7.6 C9.2,5.0 11.0,4.3 12.1,4.3 C13.4,4.3 15.4,5.1 16.8,7.7 C17.9,9.8 18.6,12.6 18.4,16.7 C16.3,17.6 13.5,17.6 12.0,17.5 C10.4,17.4 7.7,17.4 5.7,16.6 Z" />
      {/* clapper swing */}
      <path d="M10.3,19.2 C11.1,20.5 13.0,20.5 13.8,19.3" />
      {/* tiny top knob */}
      <path d="M11.6,3.4 C12.1,3.0 12.5,3.0 12.6,3.7 C12.6,4.2 12.1,4.4 11.7,4.2 C11.4,4.0 11.4,3.6 11.6,3.4 Z" fill={color} stroke="none" />
    </svg>
  );
}
