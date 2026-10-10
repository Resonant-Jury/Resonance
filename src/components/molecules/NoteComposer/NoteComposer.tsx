'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Field, Textarea, CharCount } from '@/components/atoms/Field/Field';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { Panel } from '@/components/molecules/Panel/Panel';
import { ModalActions, ModalCloseRow } from '@/components/molecules/Modal/ModalActions';
import { useMyProfile } from '@/lib/data/hooks';
import { ApiError } from '@/lib/db/firestore/client/api';
import { sendNote, NOTE_MAX_LENGTH } from '@/lib/db/firestore/client/notes';
import { useHint } from '@/lib/hints';
import { newClientId } from '@/lib/chat/outbox';

/** Past this length the quiet「寫成一張共振卡？」upgrade line appears. */
export const NOTE_UPGRADE_THRESHOLD = 200;

export interface NoteComposerProps {
  cardId: string;
  /** Draft carried in from the resonance editor's downgrade exit. */
  initialText?: string;
  onSent?: () => void;
  /**
   * 紙條 → 共振 upgrade: called with the current text when the writer decides
   * this deserves to be a card of their own.
   */
  onUpgrade?: (text: string) => void;
  onClose?: () => void;
  /**
   * `soft` (default) draws its own tinted panel; `plain` renders chrome-free
   * for hosts that already provide a surface (e.g. a Modal).
   */
  variant?: 'soft' | 'plain';
}

/**
 * The private note (小紙條) composer — deliberately NOT the full CardEditor:
 * one textarea, one send button. The lightness of the form is the lowness of
 * the barrier. Speaking to the author has no audience, no counts.
 */
export function NoteComposer({
  cardId,
  initialText,
  onSent,
  onUpgrade,
  onClose,
  variant = 'soft',
}: NoteComposerProps) {
  const t = useTranslations('card.note');
  const tCard = useTranslations('card');
  const tMessages = useTranslations('messages');
  const { data: me } = useMyProfile();
  const [text, setText] = useState(initialText ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const privacyHint = useHint('note-privacy');
  // The send in flight or failed: its words and its clientId. Pressing Send
  // again on the same words is a retry and reuses the id — the server then
  // finds a note whose answer was lost instead of leaving it twice. Other
  // words (or another card) are another note, with an id of their own.
  const attempt = useRef<{ cardId: string; text: string; clientId: string } | null>(null);

  const trimmed = text.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH && !!me;

  function submit() {
    if (!valid || pending) return;
    setError(null);
    const same = attempt.current?.cardId === cardId && attempt.current.text === trimmed;
    if (!same) attempt.current = { cardId, text: trimmed, clientId: newClientId() };
    const { clientId } = attempt.current!;
    start(async () => {
      try {
        await sendNote({ cardId, text: trimmed, clientId });
        attempt.current = null;
        setSent(true);
        onSent?.();
      } catch (err) {
        // Said in the reader's language, never the server's: a letter already full waits for its answer, and a
        // card gone (deleted, or hidden from the writer since — taking its notes with it) can't be written to:
        // sending again won't help, so not "try again".
        setError(
          err instanceof ApiError && err.code === 'conflict'
            ? t('waitForReply')
            : err instanceof ApiError && err.status === 404
              ? tCard('notFound.title')
              : tMessages('sendError'),
        );
      }
    });
  }

  if (sent) {
    return (
      <Panel variant={variant} collapseOnMobile={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="note" size={18} />
          <span style={{ fontSize: 14, color: 'var(--color-text)' }}>{t('sent')}</span>
        </div>
        {/* Nothing is left to do but leave: the one-exit notice's close at the
            foot, a small tonal pill, centred (no ✕ — the modal around it has
            none either). */}
        {onClose && <ModalCloseRow label={t('close')} onClose={onClose} />}
      </Panel>
    );
  }

  return (
    <Panel variant={variant} collapseOnMobile={false}>
      <Field
        label={t('label')}
        hint={privacyHint.visible ? t('hint') : undefined}
        trailing={<CharCount count={trimmed.length} max={NOTE_MAX_LENGTH} />}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('placeholder')}
          rows={4}
          maxLength={NOTE_MAX_LENGTH}
        />
      </Field>

      {/* The upgrade line arrives quietly under the box — never a popup, never
          an interruption. Wrong-door costs stay near zero in both directions. */}
      {onUpgrade && trimmed.length > NOTE_UPGRADE_THRESHOLD && (
        <button
          type="button"
          onClick={() => onUpgrade(text)}
          style={{
            background: 'none',
            border: 'none',
            padding: '2px 0 10px',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--color-terracotta)',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
          }}
        >
          {t('upgrade')}
        </button>
      )}

      {error && (
        <p style={{ fontSize: 12, color: 'var(--color-terracotta)', margin: '0 0 10px' }}>
          {error}
        </p>
      )}

      {/* Breathing room between the char-count line and the action row. The
          panel (or the modal hosting it) is the frame, so neither button
          draws a pen line: cancel the tonal pill, Send the solid verb,
          rightmost — the modal foot every dialog shares. */}
      <div style={{ marginTop: 18 }}>
        <ModalActions busy={pending}>
          {onClose && (
            <OrganicButton variant="tonal" size="sm" onClick={onClose} disabled={pending}>
              {t('cancel')}
            </OrganicButton>
          )}
          <OrganicButton variant="solid" size="sm" onClick={submit} disabled={!valid} loading={pending}>
            {t('send')}
          </OrganicButton>
        </ModalActions>
      </div>
    </Panel>
  );
}
