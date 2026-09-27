import type { IconRenderProps } from '../types';

// Block: an imperfect circle with a single diagonal stroke through it.
export function BanIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* ring as one closed wobbly loop */}
      <path d="M12.1,3.2 C16.9,3.1 20.9,7.0 20.8,12.0 C20.7,16.9 16.8,20.9 11.9,20.8 C7.1,20.7 3.2,16.8 3.2,12.0 C3.3,7.2 7.2,3.3 12.1,3.2 Z" />
      {/* the bar, drawn corner to corner with a slight bow */}
      <path d="M6.0,6.1 C9.9,9.8 14.0,13.9 17.9,17.9" />
    </svg>
  );
}
