'use client';

import { useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import { useAuth } from '@/components/providers/AuthProvider';
import type { CardEditorHandle } from '@/components/molecules/CardEditor/CardEditor';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
import { useRouter } from '@/i18n/navigation';
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
 * opens full bleed;「開啟卡片」on one of the viewer's cards opens the right pane
 * with the card ready to edit. At the split (≥ 1200px) it is one page with the
 * writer's: the pane beside the map, with no header — another card opens in
 * it in place, someone else's card on its own page, and the divider folds the
 * pane away (saved at once) and docks to show it again. Below the split the
 * pane covers the map: its header row names what it shows, as the writer's
 * bar does, its →| (or Escape) hands the viewport back to the map, and a
 * resonated card by another author opens there as its reading panel.
 */
export function ThoughtMapPage() {
  const t = useTranslations('write');
  const { user } = useAuth();
  const router = useRouter();
  const split = useMediaQuery('(min-width: 1200px)');
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  const editor = useRef<CardEditorHandle>(null);
  const openCard = (card: Card) => {
    if (split === true && card.authorId !== user?.id) router.push(`/card/${card.slug ?? card.id}`);
    // The card shown before it saves as its editor goes.
    else setOpenedCard(card);
  };
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
      onHide={() => void editor.current?.saveNow().catch((err) => console.error('Save failed:', err))}
      paneTitle={paneTitle}
      paneKey={openedCard?.id}
      onOpenCard={openCard}
    >
      {openedCard && <OpenedCardPane key={openedCard.id} card={openedCard} titled={false} editorRef={editor} />}
    </WorkspaceShell>
  );
}
