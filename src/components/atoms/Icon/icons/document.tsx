import type { IconRenderProps } from '../types';

// Hand-drawn sheet of paper with a dog-eared top corner and three text lines:
// the sheet's sides bow and wander, the fold is a quick curved tuck, and each
// line of text rises and dips like a hand's, the last one short.
export function DocumentIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* page outline with the corner folded in at the top-right */}
      <path d="M6.3,4.0 C8.6,3.4 11.5,3.9 13.8,3.6 C15.4,5.0 16.9,6.6 18.5,8.1 C18.8,10.9 18.2,13.6 18.6,16.4 C18.7,17.7 18.5,19.0 18.3,20.2 C15.4,20.7 12.0,20.2 9.0,20.5 C8.2,20.6 7.3,20.5 6.5,20.3 C6.1,17.5 6.8,14.6 6.4,11.8 C6.1,9.2 6.6,6.5 6.3,4.0 Z" />
      {/* dog-ear fold */}
      <path d="M13.8,3.7 C13.4,5.1 14.1,6.6 13.9,8.1 C15.5,8.4 17.0,7.9 18.5,8.2" />
      {/* three text lines, each rising and dipping, the last one short */}
      <path d="M9.1,12.3 C10.6,11.8 12.2,12.6 13.8,12.1 C14.5,11.9 15.2,12.1 15.8,12.3" />
      <path d="M9.2,15.0 C11.0,14.6 12.5,15.3 14.4,14.8 C14.9,14.7 15.4,14.8 15.9,15.0" />
      <path d="M9.1,17.7 C10.4,17.3 11.7,17.9 13.3,17.5" />
    </svg>
  );
}
