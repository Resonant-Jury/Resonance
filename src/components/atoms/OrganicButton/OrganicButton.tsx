'use client';

import { CSSProperties, MouseEvent, ReactNode, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '../ShapeGrain/ShapeGrain';
import { BrushWash } from '../BrushWash/BrushWash';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wobRect } from '@/lib/design/wobRect';
import styles from './OrganicButton.module.css';

/**
 * A button is a filled shape and never draws a pen line: an outline marks a
 * container (a card, a modal, a panel, a bar) or an input (a field, a select),
 * and a button inside or beside one would only add a second line to read. What
 * says "press me" is the fill — the same organic pill, coloured by rank:
 *  - `solid`      the verb: deep terracotta, cream label — Publish, Sign in,
 *                 Confirm, the page's one call to action
 *  - `tonal`      a secondary action: a soft peach face with a deep
 *                 terracotta label — Share your story, Sign out, Retry, the
 *                 thought map beside the shelf picker
 *  - `text`       no fill, muted ink: Cancel / Keep / Close beside a verb
 *  - `textAccent` the same in deep terracotta: a quiet accent ("load more", Unblock)
 *  - `danger`     solid in red, for what can't be undone (delete a card, the account)
 *  - `ink`        solid in the ink colour, cream label: for a brand that asks
 *                 for a black button (Sign in with Apple)
 *  - `paper`      the cards' paper, ink label: a control floating over busy
 *                 content (the thought map's toolbar) that needs a ground to
 *                 read on
 *  - `ctaLight` / `ctaGhost`  the same two ranks on the terracotta CTA band:
 *                 a cream pill, and a deeper-terracotta one with a cream label
 * The older names keep working and wear the new faces — `primary` is `solid`;
 * `outline`, `ghost`, `secondary` and `secondaryOutline` are `tonal` — so the
 * call sites can move to the rank names at their own pace. The apps'
 * OrganicButton (ButtonVariant / Variant) carries the same names. Every face
 * keeps the hover brush and, for the keyboard, a focus ring round the pill.
 */
export type OrganicButtonVariant =
  | 'primary' | 'secondary' | 'ghost' | 'outline' | 'ctaLight' | 'ctaGhost' | 'secondaryOutline'
  | 'solid' | 'tonal' | 'danger' | 'ink' | 'text' | 'textAccent' | 'paper';

// The fallback is the red every error line and danger row already uses
// (`--color-danger` itself is not defined anywhere), deepened like the
// terracotta fill so its cream label clears 4.5:1 (5.1:1).
const DANGER = 'color-mix(in oklch, var(--color-danger, oklch(58% 0.16 25)), black 8%)';

type Face = { fill: string; text: string; hoverOverlay: string };

// A filled face darkens under the hover ink; a tinted or bare one takes a
// terracotta wash.
const DARKEN = 'oklch(0% 0 0 / 0.14)';
const WASH = 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)';
const SOLID: Face = { fill: 'var(--button-fill)', text: 'var(--color-cream)', hoverOverlay: DARKEN };
const TONAL: Face = { fill: 'var(--button-tonal)', text: 'var(--button-on-tonal)', hoverOverlay: WASH };

const BTN_VARIANTS: Record<OrganicButtonVariant, Face> = {
  solid: SOLID,
  primary: SOLID,
  tonal: TONAL,
  outline: TONAL,
  ghost: TONAL,
  secondary: TONAL,
  secondaryOutline: TONAL,
  // On the terracotta band: cream for the verb, a deeper terracotta for the
  // second action (cream on it 5.5:1; the band itself carries only large type).
  ctaLight:   { fill: 'var(--color-cream)', text: 'var(--button-on-tonal)', hoverOverlay: 'oklch(0% 0 0 / 0.08)' },
  ctaGhost:   { fill: 'color-mix(in oklch, var(--color-terracotta), black 18%)', text: 'var(--color-cream)', hoverOverlay: 'oklch(96% 0.015 75 / 0.14)' },
  danger:     { fill: DANGER, text: 'var(--color-cream)', hoverOverlay: DARKEN },
  ink:        { fill: 'var(--color-text)', text: 'var(--color-cream)', hoverOverlay: DARKEN },
  text:       { fill: 'transparent', text: 'var(--color-text-muted)', hoverOverlay: WASH },
  textAccent: { fill: 'transparent', text: 'var(--button-on-tonal)', hoverOverlay: WASH },
  paper:      { fill: 'var(--color-card-bg)', text: 'var(--color-text)', hoverOverlay: WASH },
};

// Each rank keeps the wobble of the variant it grew out of (solid / danger /
// ink: primary's, tonal: outline's, text / paper: ghost's), so a renamed call
// site wobbles exactly as before — and like its native twin.
const BTN_SEEDS: Record<OrganicButtonVariant, number> = {
  primary: 3, secondary: 201, ghost: 401, outline: 601, ctaLight: 801, ctaGhost: 1001, secondaryOutline: 1201,
  solid: 3, tonal: 601, danger: 3, ink: 3, text: 401, textAccent: 601, paper: 401,
};

// Buttons are small — keep the wobble gentle (few turns, low bow) so the
// face reads as a calm pill rather than a busy blob. Module-scoped so the
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
  /** Not pressable yet (a dialog's verb before there is anything to act on): faded, no hover ink. */
  disabled?: boolean;
  style?: CSSProperties & { fillColor?: string };
  className?: string;
}

export function OrganicButton({ children, variant = 'primary', size = 'md', block = false, onClick, disabled = false, style = {}, className }: OrganicButtonProps) {
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
  // scripts) the button stands in as a plain pill of its own fill
  // (.res-shape-stand-in): a solid's cream label never sits on cream.
  const standIn = {
    '--shape-fill': style.fillColor || v.fill,
    '--shape-radius': `${R}px`,
  } as CSSProperties;

  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={disabled}
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
        color={v.hoverOverlay}
        x={pos.x} y={pos.y} on={hovered && !disabled} duration={340} overshoot={4}
      />
      <span className={styles.label}>{children}</span>
    </button>
  );
}
