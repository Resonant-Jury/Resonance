'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Field, Textarea, CharCount } from '@/components/atoms/Field/Field';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { Panel } from '@/components/molecules/Panel/Panel';
import { useMyProfile } from '@/lib/data/hooks';
import { sendNote, NOTE_MAX_LENGTH } from '@/lib/db/firestore/client/notes';
import { useHint } from '@/lib/hints';

/** Past this length the quiet「寫成一張共振卡？」upgrade line appears. */
export const NOTE_UPGRADE_THRESHOLD = 200;

export interface NoteComposerProps {
  cardId: string;
  /** The card's author — the only reader this note will ever have. */
  toUserId: string;
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
  toUserId,
  initialText,
  onSent,
  onUpgrade,
  onClose,
  variant = 'soft',
}: NoteComposerProps) {
  const t = useTranslations('card.note');
  const { data: me } = useMyProfile();
  const [text, setText] = useState(initialText ?? '');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const privacyHint = useHint('note-privacy');

  const trimmed = text.trim();
  const valid = trimmed.length > 0 && trimmed.length <= NOTE_MAX_LENGTH && !!me;

  function submit() {
    if (!valid || pending) return;
    setError(null);
    start(async () => {
      try {
        await sendNote({ cardId, toUserId, text: trimmed, fromHandle: me!.handle });
        setSent(true);
        onSent?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  }

  if (sent) {
    return (
      <Panel variant={variant} collapseOnMobile={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="note" size={18} />
          <span style={{ fontSize: 14, color: 'var(--color-text)' }}>{t('sent')}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('close')}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                padding: 4,
              }}
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
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

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        {onClose && (
          <OrganicButton variant="ghost" onClick={onClose}>
            {t('cancel')}
          </OrganicButton>
        )}
        <div style={{ opacity: valid ? 1 : 0.5, pointerEvents: valid ? 'auto' : 'none' }}>
          <OrganicButton variant="outline" onClick={submit}>
            {pending ? '…' : t('send')}
          </OrganicButton>
        </div>
      </div>
    </Panel>
  );
}
