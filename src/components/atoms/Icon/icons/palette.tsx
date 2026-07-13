import type { IconRenderProps } from '../types';

// Hand-drawn artist's palette: an irregular blob with a thumb-hole notch at the
// lower left and three little paint wells dotted across the top.
export function PaletteIcon({ size = 22, strokeWidth = 1.5, color = 'currentColor' }: IconRenderProps) {
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
      {/* palette outline: kidney-ish blob, thumb dip tucked into the bottom */}
      <path d="M12,4.0 C16.8,3.8 20.3,7.1 20.1,11.2 C20.0,13.5 18.2,14.8 16.3,14.9 C15.0,15.0 14.2,15.9 14.4,17.1 C14.6,18.7 13.5,19.9 11.8,20.0 C7.0,20.2 3.7,16.4 3.9,11.7 C4.1,7.3 7.3,4.2 12,4.0 Z" />
      {/* thumb hole */}
      <path d="M10.6,16.4 C10.6,17.0 10.1,17.5 9.5,17.5 C8.9,17.5 8.4,17.0 8.4,16.4 C8.4,15.8 8.9,15.3 9.5,15.3 C10.1,15.3 10.6,15.8 10.6,16.4 Z" />
      {/* three paint wells */}
      <path d="M8.0,9.4 C8.0,9.9 7.6,10.3 7.1,10.3 C6.6,10.3 6.2,9.9 6.2,9.4 C6.2,8.9 6.6,8.5 7.1,8.5 C7.6,8.5 8.0,8.9 8.0,9.4 Z" />
      <path d="M12.9,7.9 C12.9,8.4 12.5,8.8 12.0,8.8 C11.5,8.8 11.1,8.4 11.1,7.9 C11.1,7.4 11.5,7.0 12.0,7.0 C12.5,7.0 12.9,7.4 12.9,7.9 Z" />
      <path d="M17.2,9.9 C17.2,10.4 16.8,10.8 16.3,10.8 C15.8,10.8 15.4,10.4 15.4,9.9 C15.4,9.4 15.8,9.0 16.3,9.0 C16.8,9.0 17.2,9.4 17.2,9.9 Z" />
    </svg>
  );
}
