import type { IconRenderProps } from '../types';

// Almond eye: two bowed lids meeting at corners, plus wobbly pupil.
export function EyeIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* outer almond as one closed wobbly bezier loop */}
      <path d="M2.6,12.2 C5.5,8.0 8.7,5.8 12.1,5.8 C15.4,5.8 18.8,8.2 21.3,11.9 C18.6,16.0 15.5,18.2 12.0,18.2 C8.6,18.2 5.2,16.0 2.6,12.2 Z" />
      {/* pupil as closed bezier circle (visibly imperfect) */}
      <path d="M10.0,10.4 C11.2,9.4 13.1,9.5 14.0,10.7 C14.9,12.0 14.5,13.7 13.3,14.4 C11.9,15.2 10.0,14.5 9.4,13.0 C8.9,12.0 9.3,11.0 10.0,10.4 Z" />
      {/* tiny catchlight */}
      <path d="M13.1,10.9 C13.4,10.8 13.7,11.0 13.6,11.3 C13.5,11.6 13.0,11.6 12.9,11.3 C12.8,11.1 12.9,11.0 13.1,10.9 Z" fill={color} stroke="none" />
    </svg>
  );
}
