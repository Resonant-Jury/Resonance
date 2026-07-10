import type { IconRenderProps } from '../types';

// Hand-drawn Union-Jack-style flag for「English」— wobbly pennant on a pole
// with a bowed cross and light diagonals. Stroke-only, matching the registry's
// pen-sketch language.
export function FlagEnIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* bowed cross */}
      <path d="M12.5,4.3 C12.4,7.5 12.6,10.7 12.5,13.9" />
      <path d="M5.0,9.2 C10.0,8.4 15.3,9.9 20.2,9.0" />
      {/* light diagonals */}
      <path d="M6.3,5.4 C7.8,6.4 9.4,7.2 10.9,8.0 M14.2,10.3 C15.7,11.2 17.3,12.0 18.8,12.8 M18.7,5.5 C17.1,6.4 15.6,7.3 14.1,8.1 M10.8,10.4 C9.3,11.2 7.9,12.1 6.4,12.9" strokeWidth={strokeWidth * 0.75} />
    </svg>
  );
}
