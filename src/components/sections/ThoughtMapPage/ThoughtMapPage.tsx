'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import { useAuth } from '@/components/providers/AuthProvider';
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
 * edit (a resonated card by another author opens as its reading panel). The
 * pane's header row names what it shows, as the writer's bar does, and its
 * →| (or Escape) hands the whole viewport back to the map.
 */
export function ThoughtMapPage() {
  const t = useTranslations('write');
  const { user } = useAuth();
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  const paneTitle = !openedCard
    ? null
    : openedCard.authorId !== user?.id
      ? t('referenceCard')
      : openedCard.publishedAt
        ? t('editPublishedTitle')
        : t('editTitle');

  return (
    <WorkspaceShell
      open={openedCard != null}
      onClose={() => setOpenedCard(null)}
      paneTitle={paneTitle}
      onOpenCard={setOpenedCard}
    >
      {openedCard && <OpenedCardPane key={openedCard.id} card={openedCard} titled={false} />}
    </WorkspaceShell>
  );
}
