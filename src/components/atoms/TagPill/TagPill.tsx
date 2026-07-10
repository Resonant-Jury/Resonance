'use client';

import { ReactNode, useMemo, useRef } from 'react';
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

export function TagPill({
  children,
  color = 'var(--color-yellow)',
  seed,
  size = 'md',
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

  const tag = (
    <span
      ref={ref}
      className={styles.pill}
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
          the editor's AI-suggest pill), so all pills read as one hand. */}
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={autoSeed}
        fillColor={color}
        strokeColor="oklch(32% 0.05 60 / 0.45)"
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
