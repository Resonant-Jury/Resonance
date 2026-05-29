import type { IconRenderProps } from '../types';

// 5-point star — each edge a bowed cubic so the star looks penned, not stamped.
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
      <path d="M12.1,3.3 C13.0,5.3 13.5,7.8 14.4,9.3 C16.4,9.4 18.7,9.5 20.4,10.1 C19.2,11.7 17.0,12.6 15.6,14.3 C16.1,16.4 16.5,18.5 17.2,20.4 C15.6,19.0 13.4,18.3 11.9,17.0 C10.0,17.9 8.1,19.6 6.6,20.4 C7.4,18.4 7.7,16.1 8.3,14.3 C7.0,12.8 5.0,11.8 3.6,10.1 C5.6,9.4 7.6,9.8 9.5,9.3 C10.4,7.5 11.0,5.4 12.1,3.3 Z" />
    </svg>
  );
}
