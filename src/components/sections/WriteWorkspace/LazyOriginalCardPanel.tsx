'use client';

import dynamic from 'next/dynamic';
import styles from './OriginalCardPanel.module.css';

/**
 * OriginalCardPanel, loaded when someone else's card is shown beside the
 * editor (writing a resonance, or opening another author's card from the
 * map). It renders that card's story with react-markdown, which writing a
 * plain draft never needs; the panel's own loading look holds its place.
 */
export const OriginalCardPanel = dynamic(() => import('./OriginalCardPanel').then((m) => m.OriginalCardPanel), {
  loading: () => (
    <div className={styles.loading}>
      <div className={styles.loadingPulse} />
    </div>
  ),
});
