import type { IconRenderProps } from '../types';

// Hand-drawn Taiwan flag — wobbly pennant on a pole, canton with a tiny
// rayed sun. Stroke-first like every registry icon; the sun disc is the only
// small accent fill.
export function FlagTwIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* pole */}
      <path d="M4.6,3.4 C4.5,9.2 4.7,15.3 4.6,21.0" />
      {/* flag body: gently waving rectangle hung off the pole */}
      <path d="M4.9,4.4 C9.8,3.6 15.2,5.0 20.2,4.2 C20.4,7.4 20.1,10.6 20.3,13.8 C15.3,14.7 10.0,13.2 5.0,14.1 Z" />
      {/* canton boundary (upper-left quarter) */}
      <path d="M12.3,4.4 C12.4,5.9 12.3,7.6 12.4,9.1 C10.0,9.3 7.4,9.0 5.0,9.2" />
      {/* sun: small disc + short rays */}
      <circle cx="8.6" cy="6.7" r="1.15" fill={color} stroke="none" />
      <path d="M8.6,4.6 L8.6,5.1 M8.6,8.3 L8.6,8.8 M6.5,6.7 L7.0,6.7 M10.2,6.7 M10.2,6.7 L10.7,6.7 M7.1,5.2 L7.4,5.5 M9.8,7.9 L10.1,8.2 M10.1,5.2 L9.8,5.5 M7.4,7.9 L7.1,8.2" strokeWidth={strokeWidth * 0.8} />
    </svg>
  );
}
