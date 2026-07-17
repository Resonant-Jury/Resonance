'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CardEditor, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { FirstCardGuide } from '@/components/molecules/FirstCardGuide/FirstCardGuide';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { Icon } from '@/components/atoms/Icon';
import { OriginalCardPanel } from './OriginalCardPanel';
import { WorkspaceShell } from './WorkspaceShell';
import { useHasWrittenCards } from '@/lib/data/hooks';
import { useRouter } from '@/i18n/navigation';
import type { Card } from '@/lib/db/types';
import styles from './WriteWorkspace.module.css';

export interface WriteWorkspaceProps {
  title: ReactNode;
  locale: CardEditorProps['locale'];
  initial?: CardEditorProps['initial'];
  referenceCardId?: string;
}

/**
 * Write mode inside the unified workspace: thought map on the left, this
 * draft's editor in the right pane (closable — the map then runs full bleed).
 * Writing a resonance swaps the map for the original card.
 *
 * For a brand-new writer (no cards at all) a small guide with 2–3 questions
 * sits above the editor (ux §5); picking one seeds it into the story as a
 * quote (remounting the editor via a nonce key, same hand-off pattern as the
 * read-after area) and the guide steps aside.
 */
export function WriteWorkspace({ title, locale, initial, referenceCardId }: WriteWorkspaceProps) {
  const t = useTranslations('write');
  const router = useRouter();

  const { data: hasWritten } = useHasWrittenCards();
  const [seed, setSeed] = useState<{ story: string; nonce: number } | null>(null);
  const [editorOpen, setEditorOpen] = useState(true);
  // A published card opened from the map shows over the map (which stays
  // mounted so its camera survives) — the draft keeps its pane.
  const [previewCardId, setPreviewCardId] = useState<string | null>(null);
  // Only the very first card, started fresh (not edits, not resonances).
  const showGuide = hasWritten === false && !seed && !initial && !referenceCardId;

  return (
    <WorkspaceShell
      open={editorOpen}
      onClose={() => setEditorOpen(false)}
      leftOverride={referenceCardId ? <OriginalCardPanel cardId={referenceCardId} /> : undefined}
      onOpenCard={(card: Card) => {
        // Published cards read fine over the map; a draft's「開啟」means
        // "edit it", which needs its own editor route.
        if (card.publishedAt) setPreviewCardId(card.id);
        else router.push(`/write/${card.id}`);
      }}
      mapOverlay={
        previewCardId && (
          <div className={styles.cardOverlay}>
            <OriginalCardPanel cardId={previewCardId} />
            <button
              type="button"
              className={styles.overlayClose}
              aria-label={t('closePreview')}
              title={t('closePreview')}
              onClick={() => setPreviewCardId(null)}
            >
              <Icon name="close" size={17} />
            </button>
          </div>
        )
      }
    >
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
    </WorkspaceShell>
  );
}
