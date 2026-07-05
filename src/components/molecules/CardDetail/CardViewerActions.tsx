'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile, useMyResonance } from '@/lib/data/hooks';
import { notifyResonance } from '@/lib/db/firestore/client/resonances';
import { useHint } from '@/lib/hints';
import type { Locale } from '@/lib/db/types';

export interface CardViewerActionsProps {
  cardId: string;
  /** The original card's title — used to prefill the resonance card's title. */
  cardTitle: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
  /**
   * The original card's extracted core insight — powers the AI opener above
   * the editor (「這張卡片的體悟是…你有過類似的經驗嗎？」). The score behind it is
   * never surfaced.
   */
  coreInsight?: string;
  /**
   * A story draft handed up from the note composer (紙條 → 共振 upgrade).
   * Changing `nonce` opens the editor seeded with `story`.
   */
  upgradeDraft?: { story: string; nonce: number };
  /**
   * When set, an exit link renders under the open editor:「還不想公開？把這段話
   * 寄給作者就好。」— called with the current story text (共振 → 紙條 downgrade).
   */
  onDowngrade?: (story: string) => void;
  /**
   * The quieter response actions (note link, bookmark) — rendered in the same
   * horizontal row as the 共振 button so the three-level hierarchy reads as
   * one gesture line.
   */
  trailing?: ReactNode;
}

/**
 * The single「共振」action on the card detail page. Clicking opens an inline
 * editor (reusing {@link CardEditor}) that authors a response card referencing
 * the original. Once the viewer has a resonance card the button reads「修改」and
 * the editor reopens with their previous content.
 */
export function CardViewerActions({
  cardId,
  cardTitle,
  author,
  coreInsight,
  upgradeDraft,
  onDowngrade,
  trailing,
}: CardViewerActionsProps) {
  const t = useTranslations('card');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: me } = useMyProfile();
  const { data: mine, mutate: mutateMine } = useMyResonance(cardId);
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const becomesCardHint = useHint('resonance-becomes-card');
  // Live story text (via CardEditor.onStoryChange) so the downgrade exit can
  // carry the draft into the note composer.
  const storyRef = useRef('');

  // 紙條 → 共振 upgrade: a new nonce re-seeds and opens the editor.
  useEffect(() => {
    if (upgradeDraft) setOpen(true);
  }, [upgradeDraft?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return null;
  // The author of the original can't resonate with their own card.
  if (user && user.id === author.id) return null;

  const hasResonance = !!mine;
  // SWR reports `undefined` while the viewer's resonance card is still loading;
  // wait so we don't accidentally start a second one.
  const loadingMine = !!user && mine === undefined;

  const refresh = () => {
    void mutateMine();
    void mutate(`resonanceCards:${cardId}`);
    void mutate(`resonators:${cardId}`);
  };

  const initial = mine
    ? {
        id: mine.id,
        thoughtCore: mine.thoughtCore,
        story: mine.story,
        tags: mine.tags,
        media: mine.media,
      }
    : {
        thoughtCore: t('resonance.titlePrefill', { title: cardTitle }),
        story: upgradeDraft?.story,
      };

  function onTrigger() {
    if (!user) {
      router.push('/signin');
      return;
    }
    setOpen((v) => !v);
  }

  function onPublished() {
    if (me) void notifyResonance(cardId, { authorId: author.id, fromHandle: me.handle });
    setOpen(false);
    refresh();
  }

  function onSavedDraft() {
    setOpen(false);
    refresh();
  }

  return (
    <div style={{ marginBottom: 40 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '4px 18px',
          padding: '24px 0',
        }}
      >
        <div style={{ opacity: loadingMine ? 0.6 : 1, pointerEvents: loadingMine ? 'none' : 'auto' }}>
          <OrganicButton variant={hasResonance ? 'outline' : 'primary'} onClick={onTrigger}>
            <Icon name={hasResonance ? 'pen' : 'wave'} size={16} style={{ marginTop: 1 }} />
            {hasResonance ? t('modify') : t('resonate')}
          </OrganicButton>
        </div>
        {trailing}
      </div>

      {open && user && (
        <>
          {/* The AI opener: the extracted insight as a writing prompt — solving
              「面對空白編輯器不知從何說起」, not enforcing any minimum. A short
              three-sentence echo is a perfectly good resonance card. */}
          {!hasResonance && coreInsight && (
            <p
              style={{
                fontSize: 14,
                color: 'var(--color-text-muted)',
                margin: '0 0 12px',
                lineHeight: 1.7,
              }}
            >
              {t('resonance.aiPrompt', { coreInsight })}
            </p>
          )}
          {becomesCardHint.visible && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 12px' }}>
              {t('resonance.hint')}
            </p>
          )}
          <CardEditor
            // Re-mount when switching between new/existing (or when an upgrade
            // draft arrives) so the editor picks up the right initial content.
            key={mine?.id ?? `new-${upgradeDraft?.nonce ?? 0}`}
            mode="inline"
            locale={locale}
            referenceCardId={cardId}
            initial={initial}
            onPublished={onPublished}
            onSavedDraft={onSavedDraft}
            onStoryChange={(s) => {
              storyRef.current = s;
            }}
          />
          {!hasResonance && onDowngrade && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onDowngrade(storyRef.current);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: '10px 2px',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: 'var(--color-text-muted)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              {t('resonance.downgrade')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
