'use client';

import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { BareIconButton } from '@/components/atoms/BareIconButton/BareIconButton';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Textarea } from '@/components/atoms/Field/Field';
import { Icon } from '@/components/atoms/Icon';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { INK } from '@/lib/design/strokes';
import { wobCircle } from '@/lib/design/wobCircle';
import { useOpenedOnce } from '@/lib/hooks/useOpenedOnce';
import { MESSAGE_MAX_LENGTH } from '@/lib/db/firestore/client/messages';
import type { Card, MessageReplyQuote } from '@/lib/db/types';
import type { ThreadDraft } from '@/lib/data/thread';
import styles from './Thread.module.css';

// The card picker loads when it is first opened, not with the thread.
const InsertCardModal = dynamic(() =>
  import('@/components/molecules/MarkdownEditor/InsertCardModal').then((m) => m.InsertCardModal),
);

export interface ThreadComposerProps {
  /** The field, for the thread to focus (a reply chosen, a message sent). */
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** Whom the thread is with: the field's name. */
  otherHandle: string;
  /** The message the next one answers, and who wrote it (null: the viewer). */
  replyingTo: MessageReplyQuote | null;
  replyHandle: string | null;
  onCancelReply: () => void;
  /** A note being replied to — the first message quotes it. */
  replyNote?: { noteId: string; cardId: string };
  /** Hands the draft over to send; false when there was nothing to send. */
  send: (draft: ThreadDraft) => boolean;
  /** There is someone to send to (the conversation can be written to). */
  ready: boolean;
}

/**
 * The thread's composer: what the next message carries (the message it
 * answers, a note it quotes, a card), the field — one line at rest, growing
 * with what is written — and the send disc. Its draft lives here, so typing
 * never draws the thread above it again; sending never holds it (the message
 * goes out behind any still on their way, and the field is ready at once).
 */
export function ThreadComposer({ inputRef, otherHandle, replyingTo, replyHandle, onCancelReply, replyNote, send, ready }: ThreadComposerProps) {
  const t = useTranslations('messages');
  const [text, setText] = useState('');
  const [pendingCard, setPendingCard] = useState<Card | null>(null);
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const cardModalLoaded = useOpenedOnce(cardModalOpen);
  // The note-reply quote rides the next message; dismissable if reconsidered.
  const [noteRef, setNoteRef] = useState(replyNote);
  useEffect(() => setNoteRef(replyNote), [replyNote?.noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-grow: the field rests at one line and takes its height from what is written (the CSS caps it).
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text, inputRef]);

  const trimmed = text.trim();
  const valid = ready && (trimmed.length > 0 || !!pendingCard) && trimmed.length <= MESSAGE_MAX_LENGTH;

  function submit() {
    if (!valid) return;
    if (!send({ text: trimmed, cardRef: pendingCard?.id, noteRef })) return;
    setText('');
    setPendingCard(null);
    setNoteRef(undefined);
    inputRef.current?.focus();
  }

  return (
    <>
      {/* What rides the next message: the message it answers, a note, a card. */}
      {replyingTo && (
        <div className={styles.replyBar}>
          <span className={styles.replyRule} aria-hidden>
            <Divider orientation="vertical" seed={31} amplitude={1.1} strokeWidth={INK} color="var(--color-terracotta)" spacing={0} />
          </span>
          <span className={styles.replyBarText}>
            <span className={styles.replyBarWho}>
              {replyHandle ? t('replyingTo', { handle: replyHandle }) : t('replyingToSelf')}
            </span>
            <span className={styles.replyBarQuote}>{replyingTo.text || t('replyCard')}</span>
          </span>
          <BareIconButton icon="close" label={t('replyCancel')} iconSize={16} tipAlign="end" onClick={onCancelReply} />
        </div>
      )}
      {(noteRef || pendingCard) && (
        <div className={styles.attachments}>
          {noteRef && (
            <span className={styles.attachChip}>
              <Icon name="note" size={14} />
              {t('quotedNote')}
              <button type="button" aria-label={t('removeCard')} className={styles.attachRemove} onClick={() => setNoteRef(undefined)}>
                <Icon name="close" size={13} />
              </button>
            </span>
          )}
          {pendingCard && (
            <span className={styles.attachChip}>
              <Icon name="cards" size={14} />
              <span className={styles.attachTitle}>{pendingCard.thoughtCore}</span>
              <button type="button" aria-label={t('removeCard')} className={styles.attachRemove} onClick={() => setPendingCard(null)}>
                <Icon name="close" size={13} />
              </button>
            </span>
          )}
        </div>
      )}

      <div className={styles.composer}>
        <BareIconButton icon="cards" label={t('attachCard')} iconSize={19} tipAlign="start" onClick={() => setCardModalOpen(true)} />
        <div className={styles.composerField}>
          <Textarea
            ref={inputRef}
            className={styles.composerInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if (e.key === 'Escape' && replyingTo) {
                onCancelReply();
              }
            }}
            placeholder={t('placeholder')}
            aria-label={t('threadWith', { handle: otherHandle })}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
          />
        </div>
        <SendDisc label={t('send')} enabled={valid} onClick={submit} />
      </div>

      {cardModalLoaded && (
        <InsertCardModal
          open={cardModalOpen}
          onClose={() => setCardModalOpen(false)}
          title={t('pickCard')}
          subtitle={t('pickCardSubtitle')}
          onPick={(card) => {
            setPendingCard(card);
            setCardModalOpen(false);
          }}
        />
      )}
    </>
  );
}

const DISC = 40;

/**
 * The composer's Send: a wobbly terracotta disc with the paper plane in
 * cream. It is the verb of the bar, so a solid face with the buttons' grain
 * and no pen line of its own (the apps' OrganicSendButton). Dimmed and deaf
 * until there is something to send — never held by a send in flight.
 */
function SendDisc({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  const d = useMemo(() => wobCircle(DISC / 2, DISC / 2, DISC / 2 - 1, 23, { segments: 8, mag: 0.9, cpJitter: 0.4 }), []);
  const [hover, setHover] = useState<{ x: number; y: number; on: boolean }>({ x: DISC / 2, y: DISC / 2, on: false });
  const at = (e: React.MouseEvent<HTMLButtonElement>, on: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: e.clientX - r.left, y: e.clientY - r.top, on });
  };
  return (
    <button
      type="button"
      className={styles.send}
      aria-label={label}
      title={label}
      aria-disabled={!enabled || undefined}
      data-enabled={enabled || undefined}
      onClick={() => enabled && onClick()}
      onMouseEnter={(e) => at(e, true)}
      onMouseLeave={(e) => at(e, false)}
    >
      <svg className={styles.sendFace} width={DISC} height={DISC} viewBox={`0 0 ${DISC} ${DISC}`} aria-hidden="true">
        <path d={d} />
      </svg>
      <ShapeGrain w={DISC} h={DISC} d={d} seed={23} opacity={0.38} frequency={1.1} />
      <BrushWash w={DISC} h={DISC} d={d} color="oklch(0% 0 0 / 0.14)" x={hover.x} y={hover.y} on={enabled && hover.on} duration={340} overshoot={4} />
      {/* The plane's weight sits low and to the left of its box: a step right and up to read as centred. */}
      <span className={styles.sendGlyph}>
        <Icon name="send" size={20} color="var(--color-cream)" strokeWidth={INK} />
      </span>
    </button>
  );
}
