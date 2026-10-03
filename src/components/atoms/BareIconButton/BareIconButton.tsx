'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { wobCircle } from '@/lib/design/wobCircle';
import { INK } from '@/lib/design/strokes';
import styles from './BareIconButton.module.css';

export interface BareIconButtonProps {
  icon: IconName;
  /** What it does: its accessible name, and the tooltip a pointer or keyboard focus shows. */
  label: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** The glyph's size (the hit area is 36px, 44px under a coarse pointer). */
  iconSize?: number;
  /** Turns the glyph (a chevron pointing up is `chevron-down` at 180). */
  rotate?: number;
  disabled?: boolean;
  /** Where the tooltip hangs: over the button (default), under it, or nowhere. */
  tip?: 'above' | 'below' | false;
  /** Which edge of the button the tooltip lines up with (it grows away from it). */
  tipAlign?: 'start' | 'center' | 'end';
  seed?: number;
  className?: string;
}

/**
 * A glyph standing on bare paper as a button — the bare「⋯」trigger's
 * language (OrganicMenu `bare`), for the small tools of a bar or beside a
 * message: muted ink at rest, a soft wobbly disc of ink under it on hover and
 * keyboard focus, and its label as a tooltip, since a frameless glyph has to
 * say what it is for.
 */
export function BareIconButton({
  icon,
  label,
  onClick,
  iconSize = 20,
  rotate,
  disabled = false,
  tip = 'above',
  tipAlign = 'center',
  seed = 5,
  className,
}: BareIconButtonProps) {
  // Escape puts the tooltip away until the pointer or focus leaves (content shown on hover or focus has to be dismissible).
  const [tipDismissed, setTipDismissed] = useState(false);
  const disc = useMemo(() => wobCircle(50, 50, 46, seed, { segments: 8, mag: 2.2, cpJitter: 0.4 }), [seed]);
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        onKeyDown={(e) => e.key === 'Escape' && setTipDismissed(true)}
        onMouseLeave={() => setTipDismissed(false)}
        onBlur={() => setTipDismissed(false)}
      >
        <svg className={styles.wash} viewBox="0 0 100 100" aria-hidden="true">
          <path d={disc} />
        </svg>
        <span className={styles.glyph} style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}>
          <Icon name={icon} size={iconSize} strokeWidth={INK} />
        </span>
      </button>
      {tip && (
        <span className={styles.tip} aria-hidden="true" data-side={tip} data-align={tipAlign} data-dismissed={tipDismissed || undefined}>
          {label}
        </span>
      )}
    </span>
  );
}
