'use client';

import { type CSSProperties, ReactNode, useMemo, useRef } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './TagPill.module.css';
import { INK } from '@/lib/design/strokes';

export type TagSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TagPillProps {
  children: ReactNode;
  color?: string;
  seed?: number;
  size?: TagSize;
  /**
   * Draws the faint ink rim. Defaults to the size's own rule (lg / xl yes, sm /
   * md no); pass `true` for a small pill that sits on bare page paper rather
   * than inside a framed card, where its fill alone would vanish.
   */
  outlined?: boolean;
  /** Renders a removal × button on the right and calls back when clicked. */
  onRemove?: () => void;
  /** Whole pill is clickable (e.g. filter chip). */
  onClick?: () => void;
  ariaLabel?: string;
}

const SIZE_FALLBACK_HEIGHT: Record<TagSize, number> = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 38,
};

/** The pen outline is for the input-like sizes only (see {@link TagPill}). */
const OUTLINED: ReadonlySet<TagSize> = new Set<TagSize>(['lg', 'xl']);

/**
 * A small pill of colour with a hand-drawn (wobbly) shape.
 *
 * sm / md are *data* — the tags on cards, in feeds and under a card's story —
 * and are repeated 3–4 times a card, so they are a bare tinted fill with no
 * outline (a stroked pill each time was clutter). lg / xl are *input-like*:
 * the writer's chosen tags, removable with ×, so they keep the faint ink
 * outline that marks a thing you can act on. (One frame per layer: an outline
 * marks a container or an input, not a label.) The exception is a small pill
 * that is not inside a framed card — the owner's "anonymous" badge under a card
 * on the shelf is cream-dark on the cream page — which asks for its rim with
 * `outlined`. The apps' TagPill has the same switch.
 */
export function TagPill({
  children,
  color = 'var(--color-yellow)',
  seed,
  size = 'md',
  outlined = OUTLINED.has(size),
  onRemove,
  onClick,
  ariaLabel,
}: TagPillProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref, 90, SIZE_FALLBACK_HEIGHT[size]);
  const autoSeed = useMemo(() => {
    if (seed != null) return seed;
    const s = String(children);
    let hash = 7;
    for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
    return (Math.abs(hash) % 9973) + 1;
  }, [children, seed]);
  const R = h > 0 ? h * 0.5 : SIZE_FALLBACK_HEIGHT[size] * 0.5;
  const interactive = Boolean(onClick);

  const rim = outlined ? 'oklch(32% 0.05 60 / 0.45)' : undefined;

  const tag = (
    <span
      ref={ref}
      // A plain pill of the same fill (and rim) until measured: see .res-shape-stand-in.
      className={`${styles.pill} res-shape-stand-in`}
      style={
        {
          '--shape-fill': color,
          '--shape-ink': rim ?? 'transparent',
          '--shape-ink-width': `${INK}px`,
          '--shape-radius': '999px',
        } as CSSProperties
      }
      data-shape-pending={w > 0 && h > 0 ? undefined : ''}
      data-size={size}
      data-interactive={interactive || undefined}
      role={interactive ? 'button' : undefined}
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {/* Wobble params (segments / curve / mag) and stroke width stay on the
          auto defaults + INK pen — the same recipe as other small chips (e.g.
          the editor's AI-suggest pill), so all pills read as one hand. With no
          strokeColor HandDrawnBorder draws the fill alone. */}
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={autoSeed}
        fillColor={color}
        strokeColor={rim}
      />
      <span className={styles.label}>{children}</span>
      {onRemove && (
        <button
          type="button"
          className={styles.removeBtn}
          aria-label="Remove tag"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
            <path
              d="M 1.6 1.8 C 3 3 5.2 5.2 8.2 8.4"
              stroke="currentColor"
              strokeWidth={INK}
              strokeLinecap="round"
              fill="none"
            />
            <path
              d="M 8.2 1.8 C 7 3 4.8 5.2 1.6 8.4"
              stroke="currentColor"
              strokeWidth={INK}
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      )}
    </span>
  );

  return tag;
}
