'use client';

import type { ReactNode } from 'react';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { HeaderChrome, HEADER_STROKE_Y, HEADER_TOTAL_H } from './HeaderChrome';
import styles from './HeaderBar.module.css';

export interface HeaderBarProps {
  title: ReactNode;
  /** The arrow's name for a screen reader, and its tooltip. */
  backLabel: string;
  onBack: () => void;
  /** Something lies under the pen line: it inks in whole, and wider screens' paper firms up. */
  scrolled?: boolean;
  /** The title is the page's own heading (the writer has no other), not a label over one. */
  heading?: boolean;
}

/**
 * A page's own bar, drawn in the app header's likeness — the apps' inline
 * bar: the back arrow and the screen's title on the header's paper, what
 * scrolls passing under its pen line. A phone's settings detail claims the
 * app header with it; the writer stands it over its workspace at every width.
 */
export function HeaderBar({ title, backLabel, onBack, scrolled = false, heading = false }: HeaderBarProps) {
  const Title = heading ? 'h1' : 'span';
  return (
    <header className={styles.bar} style={{ height: HEADER_TOTAL_H }}>
      <HeaderChrome scrolled={scrolled} />
      <div className={styles.row} style={{ height: HEADER_STROKE_Y }}>
        <BareIconButton
          icon="arrow-right"
          mirror
          tone="ink"
          label={backLabel}
          iconSize={18}
          tip="below"
          tipAlign="start"
          seed={13}
          className={styles.back}
          onClick={onBack}
        />
        <Title className={styles.title}>{title}</Title>
      </div>
    </header>
  );
}
