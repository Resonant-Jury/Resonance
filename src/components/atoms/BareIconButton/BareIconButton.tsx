'use client';

import { useMemo, useState, type ComponentProps, type MouseEvent } from 'react';
import { Icon, type IconName } from '@/components/atoms/Icon';
import { Link } from '@/i18n/navigation';
import { wobCircle } from '@/lib/design/wobCircle';
import { INK } from '@/lib/design/strokes';
import styles from './BareIconButton.module.css';

export interface BareIconButtonProps {
  icon: IconName;
  /** What it does: its accessible name, and the tooltip a pointer or keyboard focus shows. */
  label: string;
  /** What a click does — or, with `href`, where it leads instead (a link, so it opens in a new tab like one). */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  href?: ComponentProps<typeof Link>['href'];
  /** The glyph's size (the hit area is 36px, 44px under a coarse pointer). */
  iconSize?: number;
  /** Turns the glyph (a chevron pointing up is `chevron-down` at 180). */
  rotate?: number;
  /** Mirrors the glyph (back is `arrow-right` mirrored, as the hand drew it). */
  mirror?: boolean;
  /** Muted ink at rest (a bar's small tools), or full ink (a bar's back arrow, which leads the row). */
  tone?: 'muted' | 'ink';
  disabled?: boolean;
  /** Where the tooltip hangs: over the button (default), under it, or nowhere. */
  tip?: 'above' | 'below' | false;
  /** Which edge of the button the tooltip lines up with (it grows away from it). */
  tipAlign?: 'start' | 'center' | 'end';
  seed?: number;
  className?: string;
}

/**
 * A glyph standing on bare paper as a button (or a link, with `href`) — the bare「⋯」trigger's
 * language (OrganicMenu `bare`), for the small tools of a bar or beside a
 * message: muted ink at rest, a soft wobbly disc of ink under it on hover and
 * keyboard focus, and its label as a tooltip, since a frameless glyph has to
 * say what it is for.
 */
export function BareIconButton({
  icon,
  label,
  onClick,
  href,
  iconSize = 20,
  rotate,
  mirror = false,
  tone = 'muted',
  disabled = false,
  tip = 'above',
  tipAlign = 'center',
  seed = 5,
  className,
}: BareIconButtonProps) {
  // Escape puts the tooltip away until the pointer or focus leaves (content shown on hover or focus has to be dismissible).
  const [tipDismissed, setTipDismissed] = useState(false);
  const disc = useMemo(() => wobCircle(50, 50, 46, seed, { segments: 8, mag: 2.2, cpJitter: 0.4 }), [seed]);
  const turn = [mirror && 'scaleX(-1)', rotate && `rotate(${rotate}deg)`].filter(Boolean).join(' ');
  const shared = {
    className: styles.button,
    'data-tone': tone,
    'aria-label': label,
    onKeyDown: (e: React.KeyboardEvent) => e.key === 'Escape' && setTipDismissed(true),
    onMouseLeave: () => setTipDismissed(false),
    onBlur: () => setTipDismissed(false),
  };
  const face = (
    <>
      <svg className={styles.wash} viewBox="0 0 100 100" aria-hidden="true">
        <path d={disc} />
      </svg>
      <span className={styles.glyph} style={turn ? { transform: turn } : undefined}>
        <Icon name={icon} size={iconSize} strokeWidth={INK} />
      </span>
    </>
  );
  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      {href ? (
        <Link href={href} {...shared}>
          {face}
        </Link>
      ) : (
        <button type="button" {...shared} disabled={disabled} onClick={onClick}>
          {face}
        </button>
      )}
      {tip && (
        <span className={styles.tip} aria-hidden="true" data-side={tip} data-align={tipAlign} data-dismissed={tipDismissed || undefined}>
          {label}
        </span>
      )}
    </span>
  );
}
