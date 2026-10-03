'use client';

import { useRef } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './MessagesPage.module.css';

/**
 * A row's hover/selected wash — a wobbly curved fill (the markdown toolbar's
 * hand-drawn chip language) driven by the row's `--row-fill` variable, instead
 * of a flat rounded rectangle or a border. The conversation list's rows and
 * the in-thread search's results wear it.
 */
export function RowWash({ seed }: { seed: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);
  return (
    <span ref={ref} className={styles.rowWash} aria-hidden>
      {w > 0 && h > 0 && (
        <HandDrawnBorder
          w={w}
          h={h}
          R={h * 0.28}
          seed={seed}
          mag={2.4}
          segmentsH={3}
          segmentsV={1}
          curve={1.3}
          cornerJitter={2.4}
          cornerOffset={h * 0.05}
          fillColor="var(--row-fill)"
        />
      )}
    </span>
  );
}
