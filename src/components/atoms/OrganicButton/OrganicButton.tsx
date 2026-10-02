'use client';

import { CSSProperties, MouseEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '../ShapeGrain/ShapeGrain';
import { BrushWash } from '../BrushWash/BrushWash';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import { INK } from '@/lib/design/strokes';
import styles from './OrganicButton.module.css';

/**
 * primary / ghost / outline (and the cta* and secondary* pairs) are the
 * standalone buttons: each draws its own pen line. The rest keep a control
 * from adding one inside something already framed — a modal, a panel, a bar, a
 * floating toolbar — the same "one frame per layer" rule the apps' OrganicButton
 * follows (ButtonVariant / Variant there carry the same names):
 *  - `solid`      primary without its rim: the verb of a dialog or panel
 *  - `danger`     solid in red, for what can't be undone (delete a card, the account)
 *  - `ink`        solid in the ink colour, cream label: for a brand that asks
 *                 for a black button (Sign in with Apple)
 *  - `text`       no fill, no stroke, muted ink: Cancel / Keep / Close beside a verb
 *  - `textAccent` the same in terracotta: a secondary action ("load more", Unblock)
 *  - `paper`      the cards' paper, no rim, ink label: a control floating over
 *                 busy content (the thought map's toolbar) that needs a ground
 *                 to read on but no outline of its own
 * The hover brush is the same for all of them; `null` strokes draw no pen line.
 */
export type OrganicButtonVariant =
  | 'primary' | 'secondary' | 'ghost' | 'outline' | 'ctaLight' | 'ctaGhost' | 'secondaryOutline'
  | 'solid' | 'danger' | 'ink' | 'text' | 'textAccent' | 'paper';

// The fallback is the red every error line and danger row already uses
// (`--color-danger` itself is not defined anywhere).
const DANGER = 'var(--color-danger, oklch(58% 0.16 25))';

const BTN_VARIANTS: Record<OrganicButtonVariant, {
  fill: string; text: string; stroke: string | null; stroke2: string | null; hoverOverlay: string;
}> = {
  primary:          { fill: 'var(--color-terracotta)', text: 'var(--color-cream)',      stroke: 'color-mix(in oklch, var(--color-terracotta), black 35%)', stroke2: 'color-mix(in oklch, var(--color-terracotta), black 50%)', hoverOverlay: 'oklch(0% 0 0 / 0.14)' },
  secondary:        { fill: 'var(--color-lavender)',   text: 'var(--color-cream)',      stroke: 'oklch(50% 0.10 290)', stroke2: 'oklch(40% 0.09 290)', hoverOverlay: 'oklch(0% 0 0 / 0.12)' },
  ghost:            { fill: 'transparent',             text: 'var(--color-text)',       stroke: 'oklch(44% 0.04 70)', stroke2: 'oklch(34% 0.04 70)', hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  outline:          { fill: 'transparent',             text: 'var(--color-terracotta)', stroke: 'color-mix(in oklch, var(--color-terracotta), black 15%)', stroke2: 'color-mix(in oklch, var(--color-terracotta), black 35%)', hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  ctaLight:         { fill: 'var(--color-cream)',      text: 'var(--color-terracotta)', stroke: 'oklch(80% 0.04 75)', stroke2: 'oklch(70% 0.04 75)', hoverOverlay: 'oklch(0% 0 0 / 0.08)' },
  ctaGhost:         { fill: 'transparent',             text: 'var(--color-cream)',      stroke: 'oklch(88% 0.02 75 / 0.65)', stroke2: 'oklch(80% 0.02 75 / 0.38)', hoverOverlay: 'oklch(96% 0.015 75 / 0.18)' },
  secondaryOutline: { fill: 'transparent',             text: 'var(--color-terracotta)', stroke: 'var(--color-terracotta)', stroke2: 'color-mix(in oklch, var(--color-terracotta), black 20%)', hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  // Frame-free variants. A filled face darkens under the ink (like primary);
  // a frameless or light one takes a terracotta tint (like ghost / outline).
  solid:            { fill: 'var(--color-terracotta)', text: 'var(--color-cream)',      stroke: null, stroke2: null, hoverOverlay: 'oklch(0% 0 0 / 0.14)' },
  danger:           { fill: DANGER,                   text: 'var(--color-cream)',      stroke: null, stroke2: null, hoverOverlay: 'oklch(0% 0 0 / 0.14)' },
  ink:              { fill: 'var(--color-text)',       text: 'var(--color-cream)',      stroke: null, stroke2: null, hoverOverlay: 'oklch(0% 0 0 / 0.14)' },
  text:             { fill: 'transparent',             text: 'var(--color-text-muted)', stroke: null, stroke2: null, hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  textAccent:       { fill: 'transparent',             text: 'var(--color-terracotta)', stroke: null, stroke2: null, hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
  paper:            { fill: 'var(--color-card-bg)',    text: 'var(--color-text)',       stroke: null, stroke2: null, hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)' },
};

// The frame-free variants borrow the seed of the one they stand in for
// (solid / danger / ink: primary's, text / paper: ghost's, textAccent: outline's),
// so a cancel wobbles like the ghost it replaced — and like its native twin.
const BTN_SEEDS: Record<OrganicButtonVariant, number> = {
  primary: 3, secondary: 201, ghost: 401, outline: 601, ctaLight: 801, ctaGhost: 1001, secondaryOutline: 1201,
  solid: 3, danger: 3, ink: 3, text: 401, textAccent: 601, paper: 401,
};

// Buttons are small — keep the wobble gentle (few turns, low bow) so the
// outline reads as a calm pill rather than a busy blob. Module-scoped so the
// reference stays stable across renders (used in a useMemo dep list).
const BTN_SEG_H: [number, number] = [2, 3];

export interface OrganicButtonProps {
  children: ReactNode;
  variant?: OrganicButtonVariant;
  /** `sm` tightens padding + font for dense chrome (e.g. canvas toolbars). */
  size?: 'md' | 'sm';
  /** Fill the container's width: the face is drawn at that width, the label stays centred. */
  block?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  style?: CSSProperties & { fillColor?: string };
  className?: string;
}

export function OrganicButton({ children, variant = 'primary', size = 'md', block = false, onClick, style = {}, className }: OrganicButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const { w, h } = useElementSize(ref, 160, 50);
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary;
  const seed = BTN_SEEDS[variant] ?? 3;
  const R = 16; // md radius for controls consistency
  const mag = Math.min(w, h) * 0.04;

  const btnCurve = 1.3;
  const btnJitter = 1.3;

  const recordPointer = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };

  const cornerOff = Math.min(w, h) * 0.03;
  const overlayPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: BTN_SEG_H,
      segmentsV: 1,
      curve: btnCurve,
      cornerJitter: btnJitter,
      cornerOffset: cornerOff,
    });
  }, [w, h, R, seed, mag, cornerOff]);

  const { fillColor: _fill, ...restStyle } = style;
  // Until measured (the server's HTML, a browser still loading or running no
  // scripts) the button stands in as a plain pill of its own fill and pen
  // (.res-shape-stand-in): a primary's cream label never sits on cream.
  const standIn = {
    '--shape-fill': style.fillColor || v.fill,
    '--shape-ink': v.stroke ?? 'transparent',
    '--shape-ink-width': `${INK}px`,
    '--shape-radius': `${R}px`,
  } as CSSProperties;

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={`${styles.btn}${size === 'sm' ? ` ${styles.sm}` : ''}${block ? ` ${styles.block}` : ''} res-shape-stand-in ${className || ''}`}
      style={{ color: v.text, ...standIn, ...restStyle }}
      data-variant={variant}
      data-shape-pending={w > 0 && h > 0 ? undefined : ''}
    >
      <HandDrawnBorder
        w={w} h={h} R={R} seed={seed} mag={mag}
        fillColor={style.fillColor || v.fill}
        strokeColor="transparent"
        strokeWidth={0}
        segmentsH={BTN_SEG_H} segmentsV={1}
        curve={btnCurve} cornerJitter={btnJitter} cornerOffset={cornerOff}
      />
      {/* Paper carries the cards' own grain (the Modal's); every other fill the button's. */}
      {v.fill !== 'transparent' && (
        <ShapeGrain
          w={w} h={h} d={overlayPath} seed={seed}
          opacity={variant === 'paper' ? 0.3 : 0.38}
          frequency={variant === 'paper' ? 0.88 : 1.1}
        />
      )}
      <BrushWash
        w={w} h={h} d={overlayPath}
        color={v.hoverOverlay || 'oklch(0% 0 0 / 0.12)'}
        x={pos.x} y={pos.y} on={hovered} duration={340} overshoot={4}
      />
      {v.stroke && (
        <HandDrawnBorder
          w={w} h={h} R={R} seed={seed} mag={mag}
          strokeColor={v.stroke}
          segmentsH={BTN_SEG_H} segmentsV={1}
          curve={btnCurve} cornerJitter={btnJitter} cornerOffset={cornerOff}
        />
      )}
      <span className={styles.label}>{children}</span>
    </button>
  );
}
