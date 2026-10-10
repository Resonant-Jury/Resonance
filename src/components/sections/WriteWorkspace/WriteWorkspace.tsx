'use client';

import { useRef, useState, type ReactNode } from 'react';
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
 * Write mode inside the unified workspace. At the split (≥ 1200px) it is one
 * page with the thought map's: the map on the left, this draft's editor in
 * the right pane, the Leave floating over the map its way back — no bar.
 * Writing a resonance swaps the map for the original card.「開啟卡片」on one
 * of the viewer's own cards opens it in the pane, in place (the draft is
 * saved first and waits under it as it was: its own card on the map brings
 * it back); someone else's card opens its card page. Below the split the
 * pane covers the map under the writer's bar — the back arrow and the title,
 * as on the apps' writer page.
 *
 * The way out leaves the page, asking first when that leaves written work
 * behind (the apps' rule and words: it is kept either way). "Save draft and
 * leave" below the form is already that choice, so it doesn't ask.
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
  const router = useRouter();
  const { data: hasWritten } = useHasWrittenCards();
  const [seed, setSeed] = useState<{ story: string; nonce: number } | null>(null);
  // A card opened from the map takes over the pane (in-memory Card → no
  // loading); never the draft's own card, which keeps the live editor.
  const [openedCard, setOpenedCard] = useState<Card | null>(null);
  // The editor's own save state, lifted so it sits at the top of the pane.
  // At the bottom of a long form it was invisible to exactly the people who
  // needed it — the ones wondering whether it is safe to walk away.
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const editor = useRef<CardEditorHandle>(null);
  // The editor of a card opened from the map (the viewer's own).
  const opened = useRef<CardEditorHandle>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  // The arrow and the dialog can both land before the page has gone: it leaves once.
  const leaving = useRef(false);
  const showOpened = openedCard != null;
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

  /** Saves what is written in the pane now — the draft, and a card opened over it — not left to the debounce. */
  const saveAll = async () => {
    const results = await Promise.allSettled([editor.current?.saveNow(), opened.current?.saveNow()]);
    for (const r of results) if (r.status === 'rejected') console.error('Save failed:', r.reason);
  };

  // What is written is saved first (not left to the debounce or the unmount),
  // then the page goes back to wherever the writer came from (or, with
  // nowhere to go back to in this tab, to the card box or the feed). A save
  // that fails doesn't keep it: the unmount's flush tries once more, and
  // staying would only ask again.
  const leaveWriter = useLeaveWriter(initial?.id ? '/me' : '/home');
  const leave = async () => {
    setConfirmingLeave(false);
    if (leaving.current) return;
    leaving.current = true;
    await saveAll();
    leaveWriter();
    // Still here a moment later (the way back went nowhere): the way out answers again.
    window.setTimeout(() => (leaving.current = false), 1500);
  };

  // 開啟卡片 on the map (at the split, where the map stands beside the pane).
  const openCard = (card: Card) => {
    // Someone else's card is read on its own page (the draft saved first: a fresh /write takes its card's
    // address at its first save, so the way back finds this draft, not a blank one).
    if (card.authorId !== user?.id) {
      void saveAll().then(() => router.push(`/card/${card.slug ?? card.id}`));
      return;
    }
    // The draft's own card is the draft: it folds a card opened over it back to it. Its own card is the
    // editor's: a fresh /write's draft has its id from its first save on, which the route's `initial` never
    // learns.
    if (card.id === (editor.current?.cardId() ?? initial?.id)) {
      setOpenedCard(null);
      return;
    }
    // Another of the viewer's cards opens in place. The draft, which stays mounted under it, is saved first;
    // a card opened before it saves as its editor goes.
    if (!showOpened) void editor.current?.saveNow().catch((err) => console.error('Save failed:', err));
    setOpenedCard(card);
  };

  // The way out — the bar's back below the split, the Leave over the map at it: asks first when it would
  // leave written work behind. Below the split a card opened over the draft (at the split, before the window
  // narrowed) steps back to the draft first.
  const leaveAsking = () => {
    // On its way out already: a second tap waits for it.
    if (leaving.current) return;
    if (editor.current?.hasWork() || opened.current?.hasWork()) setConfirmingLeave(true);
    else void leave();
  };
  const goBack = () => {
    if (leaving.current) return;
    if (showOpened) setOpenedCard(null);
    else leaveAsking();
  };
  // A live card's revision is kept but not applied: said of the card the pane shows.
  const leavingPublished = showOpened ? openedCard.publishedAt != null : isPublished;

  return (
    <>
      <WorkspaceShell
        open
        bar={{ title: barTitle, onBack: goBack }}
        onLeave={leaveAsking}
        onHide={() => void saveAll()}
        leftOverride={referenceCardId ? <OriginalCardPanel cardId={referenceCardId} /> : undefined}
        onOpenCard={openCard}
      >
        {/* The draft stays mounted under a card opened from the map, so its
            own card brings it back as it was — remounted from `initial`, a new
            card would start over without its draft and write a second one. */}
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
            <OpenedCardPane card={openedCard} titled={false} editorRef={opened} />
          </div>
        )}
      </WorkspaceShell>
      <ConfirmModal
        open={confirmingLeave}
        title={t('leaveTitle')}
        body={leavingPublished ? t('leaveBodyRevision') : t('leaveBody')}
        cancelLabel={t('leaveStay')}
        confirmLabel={t('leaveConfirm')}
        onCancel={() => setConfirmingLeave(false)}
        onConfirm={() => void leave()}
      />
    </>
  );
}
