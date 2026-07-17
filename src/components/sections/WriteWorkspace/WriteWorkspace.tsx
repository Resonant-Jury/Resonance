'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CardEditor, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { FirstCardGuide } from '@/components/molecules/FirstCardGuide/FirstCardGuide';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { OpenedCardPane } from './OpenedCardPane';
import { OriginalCardPanel } from './OriginalCardPanel';
import { WorkspaceShell } from './WorkspaceShell';
import { useHasWrittenCards } from '@/lib/data/hooks';
import type { Card } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

export interface WriteWorkspaceProps {
  title: ReactNode;
  locale: CardEditorProps['locale'];
  initial?: CardEditorProps['initial'];
  referenceCardId?: string;
  /** Slug-or-id of the card page this editor was entered from (the original
   * card of a resonance, or the edited card's own page once published) —
   * Back then returns there instead of the profile page. */
  backCardKey?: string;
}

/**
 * Write mode inside the unified workspace: thought map on the left, this
 * draft's editor in the right pane (closable — the map then runs full bleed).
 * Writing a resonance swaps the map for the original card.「開啟卡片」on the
 * map opens that card in the same right pane (never anywhere else).
 *
 * For a brand-new writer (no cards at all) a small guide with 2–3 questions
 * sits above the editor (ux §5); picking one seeds it into the story as a
 * quote (remounting the editor via a nonce key, same hand-off pattern as the
 * read-after area) and the guide steps aside.
 */
export function WriteWorkspace({
  title,
  locale,
  initial,
  referenceCardId,
  backCardKey,
}: WriteWorkspaceProps) {
  const t = useTranslations('write');

  const { data: hasWritten } = useHasWrittenCards();
  const [seed, setSeed] = useState<{ story: string; nonce: number } | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  // A card opened from the map takes over the pane (in-memory Card → no
  // loading); the same card as this route's draft keeps the live editor.
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  const showOpened = openedCard != null && openedCard.id !== initial?.id;
  // Only the very first card, started fresh (not edits, not resonances).
  const showGuide = hasWritten === false && !seed && !initial && !referenceCardId;

  return (
    <WorkspaceShell
      open={editorOpen}
      onClose={() => {
        setEditorOpen(false);
        setOpenedCard(null);
      }}
      leftOverride={referenceCardId ? <OriginalCardPanel cardId={referenceCardId} /> : undefined}
      onOpenCard={(card: Card) => {
        setOpenedCard(card);
        setEditorOpen(true);
      }}
      back={backCardKey ? { href: `/card/${backCardKey}`, label: t('backToCard') } : undefined}
    >
      {showOpened ? (
        <OpenedCardPane card={openedCard} />
      ) : (
        <div className={styles.editorCol}>
          <PageTitle>{title}</PageTitle>
          {showGuide && (
            <div style={{ marginBottom: 28 }}>
              <FirstCardGuide
                onPick={(question) =>
                  setSeed((prev) => ({
                    story: `> ${question}\n\n`,
                    nonce: (prev?.nonce ?? 0) + 1,
                  }))
                }
              />
            </div>
          )}
          <CardEditor
            key={seed?.nonce ?? 0}
            initial={seed ? { story: seed.story } : initial}
            locale={locale}
            referenceCardId={referenceCardId}
          />
        </div>
      )}
    </WorkspaceShell>
  );
}
