import type { IconRenderProps } from '../types';

// 4-point sparkle with bowed strokes + two tiny secondary glints.
export function SparkleIcon({
  size = 22,
  strokeWidth = 1.4,
  color = 'currentColor',
}: IconRenderProps) {
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
      {/* main 4-point body — each lobe is a bowed cubic in/out */}
      <path d="M12.4,3.5 C12.9,7.0 12.0,10.2 13.6,11.7 C15.2,13.1 18.6,12.4 20.4,12.6 C17.0,13.4 14.6,12.5 13.3,14.0 C11.9,15.6 12.7,18.7 12.2,20.6 C11.5,17.4 12.0,14.2 10.6,12.9 C9.0,11.5 5.7,12.4 3.6,12.0 C7.0,11.4 10.2,12.0 11.4,10.5 C12.7,8.8 11.6,5.4 12.4,3.5 Z" />
      {/* small secondary glint top-right */}
      <path d="M18.4,5.4 C18.7,6.3 18.4,6.9 19.4,7.0 C18.5,7.2 18.8,7.9 18.4,8.5 C18.2,7.7 17.4,7.4 16.8,7.1 C17.6,6.9 18.2,6.3 18.4,5.4 Z" />
      {/* tiny lower-left glint */}
      <path d="M5.5,17.2 C5.8,17.8 5.7,18.4 6.4,18.5 C5.8,18.7 5.8,19.3 5.5,19.8 C5.3,19.1 4.8,18.9 4.3,18.5 C4.8,18.4 5.2,17.9 5.5,17.2 Z" />
    </svg>
  );
}
