'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { CardEditor, type CardEditorHandle, type CardEditorProps } from '@/components/molecules/CardEditor/CardEditor';
import { ConfirmModal } from '@/components/molecules/ConfirmModal/ConfirmModal';
import { FirstCardGuide } from '@/components/molecules/FirstCardGuide/FirstCardGuide';
import { OpenedCardPane } from './OpenedCardPane';
import { OriginalCardPanel } from './LazyOriginalCardPanel';
import { WorkspaceShell } from './WorkspaceShell';
import { useAuth } from '@/components/providers/AuthProvider';
import { useHasWrittenCards } from '@/lib/data/hooks';
import { useLeaveWriter } from '@/lib/hooks/useLeaveWriter';
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
 * draft's editor in the right pane, and over both the writer's bar — the back
 * arrow and the title, as on the apps' writer page. Writing a resonance swaps
 * the map for the original card.「開啟卡片」on the map opens that card in the
 * same right pane (never anywhere else), a step deeper: the bar takes its
 * title, and back returns to the draft, which waited under it as it was.
 *
 * Back from the draft leaves the page, asking first when that leaves written
 * work behind (the apps' rule and words: it is kept either way). "Save draft
 * and leave" below the form is already that choice, so it doesn't ask. The
 * browser's back steps out of a card opened from the map as the arrow does.
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
}: WriteWorkspaceProps) {
  const t = useTranslations('write');
  const { user } = useAuth();
  const { data: hasWritten } = useHasWrittenCards();
  const [seed, setSeed] = useState<{ story: string; nonce: number } | null>(null);
  // A card opened from the map takes over the pane (in-memory Card → no
  // loading); the same card as this route's draft keeps the live editor.
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  // The editor's own save state, lifted so it sits at the top of the pane.
  // At the bottom of a long form it was invisible to exactly the people who
  // needed it — the ones wondering whether it is safe to walk away.
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const editor = useRef<CardEditorHandle>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // The arrow and the dialog can both land before the page has gone: it leaves once.
  const leaving = useRef(false);
  const showOpened = openedCard != null && openedCard.id !== initial?.id;
  // Only the very first card, started fresh (not edits, not resonances).
  const showGuide = hasWritten === false && !seed && !initial && !referenceCardId;
  const isPublished = initial?.publishedAt != null;

  // What the pane shows names the bar: the draft, or a card opened from the
  // map — the viewer's own to edit, or the original of one they resonated with.
  const barTitle = !showOpened
    ? title
    : openedCard.authorId !== user?.id
      ? t('referenceCard')
      : openedCard.publishedAt
        ? t('editPublishedTitle')
        : t('editTitle');

  // What is written is saved first (not left to the debounce or the unmount),
  // then the page goes back to wherever the writer came from (or, with
  // nowhere to go back to in this tab, to the card box or the feed).
  const leaveWriter = useLeaveWriter(initial?.id ? '/me' : '/home');
  const leave = async () => {
    setConfirmingLeave(false);
    if (leaving.current) return;
    leaving.current = true;
    try {
      await editor.current?.saveNow();
    } catch (err) {
      // The unmount's flush tries once more; staying would only ask again.
      console.error('Save before leaving failed:', err);
    }
    leaveWriter();
    // Still here a moment later (the way back went nowhere): the way out answers again.
    window.setTimeout(() => (leaving.current = false), 1500);
  };

  // A card opened from the map is a step deeper in this tab's history too, so the browser's or the system's
  // back steps out of it as the bar's arrow does, instead of leaving the writer. Its entry is the page's own
  // (Next's state spread in: the router reads its tree from history.state); the popstate that takes it away
  // folds the card back to the draft — the arrow's way out of it is that same back.
  const openCard = (card: Card) => {
    if (!openedRef.current) {
      const base = (window.history.state ?? {}) as Record<string, unknown>;
      window.history.pushState({ ...base, __writerOpened: true }, '', window.location.href);
    }
    setOpenedCard(card);
  };
  const openedRef = useRef(false);
  openedRef.current = openedCard != null;
  useEffect(() => {
    const onPop = () => {
      if (openedRef.current) setOpenedCard(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const goBack = () => {
    // On its way out already: a second tap waits for it.
    if (leaving.current) return;
    if (showOpened) {
      window.history.back();
      return;
    }
    if (editor.current?.hasWork()) setConfirmingLeave(true);
    else void leave();
  };

  return (
    <>
      <WorkspaceShell
        open
        bar={{ title: barTitle, onBack: goBack }}
        leftOverride={referenceCardId ? <OriginalCardPanel cardId={referenceCardId} /> : undefined}
        onOpenCard={openCard}
      >
        {/* The draft stays mounted under a card opened from the map, so back
            finds it as it was — remounted from `initial`, a new card would
            start over without its draft and write a second one. */}
        <div className={styles.paneLayer} hidden={showOpened}>
          <div className={styles.editorCol}>
            {saveStatus && <p className={styles.saveStatus}>{saveStatus}</p>}
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
              ref={editor}
              initial={seed ? { story: seed.story } : initial}
              locale={locale}
              referenceCardId={referenceCardId}
              onSaveStatusChange={setSaveStatus}
            />
          </div>
        </div>
        {showOpened && (
          <div key={openedCard.id} className={styles.paneLayer}>
            <OpenedCardPane card={openedCard} titled={false} />
          </div>
        )}
      </WorkspaceShell>
      <ConfirmModal
        open={confirmingLeave}
        title={t('leaveTitle')}
        body={isPublished ? t('leaveBodyRevision') : t('leaveBody')}
        cancelLabel={t('leaveStay')}
        confirmLabel={t('leaveConfirm')}
        onCancel={() => setConfirmingLeave(false)}
        onConfirm={() => void leave()}
      />
    </>
  );
}
