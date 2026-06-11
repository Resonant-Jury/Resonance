'use client';

import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { INK_LIGHT } from '@/lib/design/strokes';
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
        R={SIZE / 2}
        seed={47}
        fillColor="var(--color-cream)"
        strokeColor="oklch(40% 0.06 60)"
        strokeWidth={INK_LIGHT}
      />
      <span className={styles.nodeRemoveIcon}>
        <Icon name="close" size={13} />
      </span>
    </button>
  );
}
