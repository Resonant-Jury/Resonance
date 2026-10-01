'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import type { Card } from '@/lib/db/types';
import styles from '@/components/sections/WriteWorkspace/WriteWorkspace.module.css';

// The pane holds the card editor (Tiptap) — most of this page's weight, and
// needed only once a card is opened. It shows the pane's own loader meanwhile.
const OpenedCardPane = dynamic(
  () => import('@/components/sections/WriteWorkspace/OpenedCardPane').then((m) => m.OpenedCardPane),
  {
    loading: () => (
      <div className={styles.editorCol} aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <SketchLoader />
      </div>
    ),
  },
);

/**
 * The standalone thought-map page, in the unified workspace shell: the map
 * opens full bleed;「開啟卡片」slides the right pane in with the card ready to
 * edit (a resonated card by another author opens as its reading panel), and ✕
 * hands the whole viewport back to the map.
 */
export function ThoughtMapPage() {
  const [openedCard, setOpenedCard] = useState<Card | null>(null);

  return (
    <WorkspaceShell
      open={openedCard != null}
      onClose={() => setOpenedCard(null)}
      onOpenCard={setOpenedCard}
    >
      {openedCard && <OpenedCardPane card={openedCard} />}
    </WorkspaceShell>
  );
}
