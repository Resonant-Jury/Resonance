'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HEADER_STROKE_Y } from '@/components/sections/AppHeader/HeaderChrome';
import { pointsToBezier, wavyPoints } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import styles from './WriteWorkspace.module.css';

/** The wave under the header: drawn this wide and stretched to the pane (its stroke keeps its width). */
const WAVE_W = 720;
const WAVE_H = 14;

function wavePaths() {
  const pts = wavyPoints(WAVE_W, WAVE_H / 2, 1.4, 157, 8);
  const strokeD = pointsToBezier(pts);
  // The paper above the wave: down the right edge, back along the wave, up the left.
  const f = (n: number) => +n.toFixed(2);
  const last = pts[pts.length - 1];
  let paperD = `M 0,0 L ${WAVE_W},0 L ${f(last[0])},${f(last[1])}`;
  for (let i = pts.length - 2; i >= 0; i--) {
    const [x0, y0] = pts[i + 1];
    const [x1, y1] = pts[i];
    const midX = (x0 + x1) / 2;
    paperD += ` C ${f(midX)},${f(y0)} ${f(midX)},${f(y1)} ${f(x1)},${f(y1)}`;
  }
  return { strokeD, paperD: `${paperD} Z` };
}

export interface PaneHeaderProps {
  /** What the pane shows (編輯卡片, 編輯已發布的卡片, 共振的原文). */
  title: ReactNode;
  /** Its name and tooltip: 收起編輯區 / Hide the editor. */
  hideLabel: string;
  onHide: () => void;
  /** Something has scrolled under it: the pen line inks in whole. */
  scrolled: boolean;
}

/**
 * The thought map's editor pane's own header row — the writer's bar in
 * small, inside the pane: on the pane's paper over what it shows, a wavy pen
 * line under it that what scrolls passes beneath; the pane's title on the
 * left, and on the right a borderless →| that folds the pane away (the edits
 * are saved as they are made, so it hides, it never discards — hence no ✕).
 * Where the pane covers the map (below the 1200px split) it is the way back,
 * as tall as the writer's bar.
 */
export function PaneHeader({ title, hideLabel, onHide, scrolled }: PaneHeaderProps) {
  const { strokeD, paperD } = useMemo(wavePaths, []);
  return (
    <header
      className={styles.paneHeader}
      data-scrolled={scrolled || undefined}
      style={{ '--pane-bar-h': `${HEADER_STROKE_Y}px` } as CSSProperties}
    >
      <div className={styles.paneHeaderRow}>
        <h2 className={styles.paneTitle}>{title}</h2>
        <BareIconButton
          icon="collapse-right"
          label={hideLabel}
          tone="ink"
          iconSize={20}
          tip="below"
          tipAlign="end"
          seed={19}
          className={styles.paneHide}
          onClick={onHide}
        />
      </div>
      <svg
        aria-hidden="true"
        className={styles.paneWave}
        viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
        preserveAspectRatio="none"
      >
        <path d={paperD} className={styles.panePaper} />
        <path
          d={strokeD}
          fill="none"
          className={styles.paneLine}
          strokeWidth={INK}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </header>
  );
}
