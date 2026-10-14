import type { IconRenderProps } from '../types';

// A hand-drawn waste bin — a lid laid on a little askew, its handle a loose
// loop, a body whose sides lean in unevenly to a rounded foot, and two slats
// that don't quite keep parallel.
export function TrashIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* lid, laid on a little askew */}
      <path d="M4.3,7.4 C6.5,6.6 9.1,7.0 11.5,6.6 C14.1,6.2 16.9,6.5 19.6,7.0" />
      {/* handle */}
      <path d="M9.3,6.8 C9.0,5.6 9.7,4.4 11.3,4.3 C12.7,4.2 14.1,4.4 14.6,5.5 C14.8,5.9 14.8,6.3 14.7,6.6" />
      {/* body: the sides lean in unevenly to a rounded foot */}
      <path d="M5.9,7.7 C6.6,10.5 6.3,13.6 6.9,16.4 C7.1,17.6 7.3,18.7 8.0,19.4 C10.5,20.1 13.6,20.0 16.1,19.4 C16.9,18.4 16.8,16.9 17.1,15.4 C17.5,12.7 17.4,10.1 18.0,7.5" />
      {/* slats */}
      <path d="M10.0,10.2 C10.5,12.3 9.9,14.5 10.5,16.8" />
      <path d="M14.0,10.1 C13.5,12.1 14.1,14.4 13.5,16.7" />
    </svg>
  );
}
