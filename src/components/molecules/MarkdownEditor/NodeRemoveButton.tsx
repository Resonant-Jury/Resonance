'use client';

import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { INK } from '@/lib/design/strokes';
import styles from './MarkdownEditor.module.css';

const SIZE = 26;

/**
 * Small "×" affordance pinned to the top-right corner of a focused editor
 * node (image / embedded card). Fixed-size, so the wobbly chrome draws
 * correctly on first paint without measuring.
 */
export function NodeRemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      className={styles.nodeRemoveBtn}
      aria-label={label}
      title={label}
      // keep the node selection while clicking the button
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      <HandDrawnBorder
        w={SIZE}
        h={SIZE}
        R={SIZE * 0.4}
        seed={47}
        mag={SIZE * 0.022}
        fillColor="var(--color-cream)"
        strokeColor="oklch(40% 0.06 60)"
        strokeWidth={INK}
        segmentsH={1}
        segmentsV={1}
        curve={1.3}
        cornerJitter={3.2}
        cornerOffset={SIZE * 0.06}
      />
      <span className={styles.nodeRemoveIcon}>
        <Icon name="close" size={13} />
      </span>
    </button>
  );
}
