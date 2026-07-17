'use client';

import { useState } from 'react';
import { OpenedCardPane } from '@/components/sections/WriteWorkspace/OpenedCardPane';
import { WorkspaceShell } from '@/components/sections/WriteWorkspace/WorkspaceShell';
import type { Card } from '@/lib/db/types';

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
