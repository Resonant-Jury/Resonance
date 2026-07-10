import type { CSSProperties } from 'react';
import { INK_STRONG } from '@/lib/design/strokes';
import { ICONS, type IconName } from './registry';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** Interior fill — only icons with a fillable body (e.g. bookmark) use it. */
  fill?: string;
  ariaLabel?: string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Unified icon renderer. Looks up a hand-drawn SVG component by name and
 * renders it with consistent props.
 *
 *   <Icon name="bell" size={22} />
 *   <Icon name="sparkle" size={16} color="var(--color-terracotta)" />
 *
 * If `ariaLabel` is provided the icon is exposed to assistive tech; otherwise
 * it is hidden (default — most icons sit next to text).
 */
export function Icon({
  name,
  size,
  color,
  strokeWidth,
  fill,
  ariaLabel,
  style,
  className,
}: IconProps) {
  const Renderer = ICONS[name];
  const resolvedSize = size ?? 26;
  const resolvedStroke = strokeWidth ?? INK_STRONG;
  return (
    <span
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...style,
      }}
    >
      <Renderer size={resolvedSize} color={color} strokeWidth={resolvedStroke} fill={fill} />
    </span>
  );
}

export type { IconName } from './registry';
