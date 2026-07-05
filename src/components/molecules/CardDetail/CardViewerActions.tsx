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
  trailing,
}: CardViewerActionsProps) {
  const t = useTranslations('card');
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: mine } = useMyResonance(cardId);

  if (loading) return null;
  // The author of the original can't resonate with their own card.
  if (user && user.id === author.id) return null;

  const hasResonance = !!mine;
  // SWR reports `undefined` while the viewer's resonance card is still loading;
  // wait so we don't accidentally start a second one.
  const loadingMine = !!user && mine === undefined;

  function onTrigger() {
    if (!user) {
      router.push('/signin');
      return;
    }
    if (hasResonance && mine) {
      router.push(`/write/${mine.id}`);
    } else {
      router.push(`/write?referenceCardId=${cardId}`);
    }
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
    </div>
  );
}
