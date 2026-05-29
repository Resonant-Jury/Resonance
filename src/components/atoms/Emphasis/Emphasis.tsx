'use client';

import type { ReactNode } from 'react';
import { wavyLine } from '@/lib/design/wavyPath';
import styles from './Emphasis.module.css';

export interface EmphasisProps {
  children: ReactNode;
  /** Underline stroke color. */
  color?: string;
  /** Underline thickness in px. */
  strokeWidth?: number;
  /** Wave amplitude in viewBox units. */
  amp?: number;
  /** Number of wave segments across the underline. */
  steps?: number;
  seed?: number;
  className?: string;
}

/**
 * Inline text emphasis with a wavy hand-drawn underline beneath it.
 * Pairs with `<Emphasis>記憶</Emphasis>` to mark a key noun or phrase.
 */
export function Emphasis({
  children,
  color = 'var(--color-terracotta)',
  strokeWidth = 2.5,
  amp = 2.2,
  steps = 6,
  seed = 7,
  className,
}: EmphasisProps) {
  const VB_W = 100;
  const VB_H = 10;
  const d = wavyLine(VB_W, seed, amp, steps);

  return (
    <span className={[styles.root, className].filter(Boolean).join(' ')}>
      <span className={styles.text}>{children}</span>
      <svg
        className={styles.underline}
        viewBox={`0 ${-VB_H / 2} ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
