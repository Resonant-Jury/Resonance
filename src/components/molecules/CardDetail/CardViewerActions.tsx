'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSWRConfig } from 'swr';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { CardEditor } from '@/components/molecules/CardEditor/CardEditor';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile, useMyResonance } from '@/lib/data/hooks';
import { notifyResonance } from '@/lib/db/firestore/client/resonances';
import type { Locale } from '@/lib/db/types';

export interface CardViewerActionsProps {
  cardId: string;
  /** The original card's title — used to prefill the resonance card's title. */
  cardTitle: string;
  author: { id: string; handle: string; initials: string; accentColor: string };
}

/**
 * The single「共振」action on the card detail page. Clicking opens an inline
 * editor (reusing {@link CardEditor}) that authors a response card referencing
 * the original. Once the viewer has a resonance card the button reads「修改」and
 * the editor reopens with their previous content.
 */
export function CardViewerActions({ cardId, cardTitle, author }: CardViewerActionsProps) {
  const t = useTranslations('card');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: me } = useMyProfile();
  const { data: mine, mutate: mutateMine } = useMyResonance(cardId);
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);

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
    : { thoughtCore: t('resonance.titlePrefill', { title: cardTitle }) };

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
      <div style={{ display: 'flex', justifyContent: 'flex-start', padding: '24px 0' }}>
        <div style={{ opacity: loadingMine ? 0.6 : 1, pointerEvents: loadingMine ? 'none' : 'auto' }}>
          <OrganicButton variant={hasResonance ? 'outline' : 'primary'} onClick={onTrigger}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Icon name={hasResonance ? 'pen' : 'wave'} size={16} />
              {hasResonance ? t('modify') : t('resonate')}
            </span>
          </OrganicButton>
        </div>
      </div>

      {open && user && (
        <CardEditor
          // Re-mount when switching between new/existing so the editor picks up
          // the right initial content.
          key={mine?.id ?? 'new'}
          mode="inline"
          locale={locale}
          referenceCardId={cardId}
          initial={initial}
          onPublished={onPublished}
          onSavedDraft={onSavedDraft}
        />
      )}
    </div>
  );
}
