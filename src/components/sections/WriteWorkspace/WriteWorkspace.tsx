'use client';

import { useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CardEditor, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { FirstCardGuide } from '@/components/molecules/FirstCardGuide/FirstCardGuide';
import { PageTitle } from '@/components/molecules/PageShell/PageShell';
import { ThoughtMapBoard } from '@/components/molecules/ThoughtMap/ThoughtMapBoard';
import { Icon } from '@/components/atoms/Icon';
import { OriginalCardPanel } from './OriginalCardPanel';
import { useHasWrittenCards } from '@/lib/data/hooks';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { wavyVertical } from '@/lib/design/wavyPath';
import { INK_LIGHT } from '@/lib/design/strokes';
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
 * The write-mode workspace: editor on the left, the author's thought map on
 * the right, separated by a single wavy vertical pen stroke — so new cards
 * are written *next to* the knowledge they grow out of. On desktop the map is
 * a fixed, full-height pane that owns the entire right half of the screen, its
 * divider running edge-to-edge top to bottom. Below 1200px the map pane steps
 * aside and only the editor remains.
 *
 * For a brand-new writer (no cards at all) a small guide with 2–3 questions
 * sits above the editor (ux §5); picking one seeds it into the story as a
 * quote (remounting the editor via a nonce key, same hand-off pattern as the
 * read-after area) and the guide steps aside.
 */
export function WriteWorkspace({ title, locale, initial, referenceCardId }: WriteWorkspaceProps) {
  const t = useTranslations('write');
  const router = useRouter();
  const railRef = useRef<HTMLDivElement>(null);
  const { h: railH } = useElementSize(railRef);
  // ~1 turning point per 130px keeps the long rule calm, not noodly.
  const railSteps = Math.max(5, Math.round(railH / 130));

  const { data: hasWritten } = useHasWrittenCards();
  const [seed, setSeed] = useState<{ story: string; nonce: number } | null>(null);
  // A card opened from the map shows *in this pane*, over the map (which stays
  // mounted so its camera survives), instead of navigating away mid-draft.
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  // Only the very first card, started fresh (not edits, not resonances).
  const showGuide = hasWritten === false && !seed && !initial && !referenceCardId;

  return (
    <div className={styles.workspace}>
      <div className={styles.editorArea}>
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
      </div>

      <aside className={styles.mapCol}>
        <div ref={railRef} className={styles.rail} aria-hidden="true">
          {railH > 0 && (
            <svg
              className={`${styles.railSvg} res-shape-fade-in`}
              width={14}
              height={railH}
              viewBox={`0 0 14 ${railH}`}
              style={{ width: 14, height: railH }}
            >
              <path
                d={wavyVertical(railH, 83, 5, railSteps)}
                transform="translate(7,0)"
                stroke="var(--field-border)"
                strokeWidth={INK_LIGHT}
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>
        {referenceCardId ? (
          <OriginalCardPanel cardId={referenceCardId} />
        ) : (
          <div className={styles.mapStack}>
            <ThoughtMapBoard
              height="100%"
              flush
              onOpenCard={(card: Card) => {
                // Published cards read fine in the pane; a draft's「開啟」
                // means "edit it", which needs the editor route.
                if (card.publishedAt) setOpenCardId(card.id);
                else router.push(`/write/${card.id}`);
              }}
            />
            {openCardId && (
              <div className={styles.cardOverlay}>
                <OriginalCardPanel cardId={openCardId} />
                <button
                  type="button"
                  className={styles.overlayClose}
                  aria-label={t('closePreview')}
                  title={t('closePreview')}
                  onClick={() => setOpenCardId(null)}
                >
                  <Icon name="close" size={17} />
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
