'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { Icon } from '@/components/atoms/Icon';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile, useMyResonance } from '@/lib/data/hooks';
import { usePrefillCard } from '@/lib/data/cardPrefill';
import { isBookmarked, toggleBookmark } from '@/lib/db/firestore/client/bookmarks';
import styles from './CardViewerActions.module.css';

// Loaded on the first 共振: most readers never open it.
const ResonatePicker = dynamic(() => import('./ResonatePicker').then((m) => m.ResonatePicker));

export interface CardViewerActionsProps {
  cardId: string;
  /** The original card's title — used to prefill the resonance card's title. */
  cardTitle: string;
  /** The card this one itself resonates with: never offered in the picker. */
  referenceCardId?: string;
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
  onOpenNote: () => void;
}

/**
 * The response action bar on the card detail page: one SegmentedActionBar at
 * every width — 共振 (the verb, solid), the note and the bookmark (tonal). On
 * a phone it spans the column in one row: the note reads 寄小紙條 (and is
 * named so there: its name is always the words it shows), and the bookmark
 * drops its words for its icon when the row has no room for them (its words
 * stay its name).
 */
export function CardViewerActions({
  cardId,
  referenceCardId,
  author,
  onOpenNote,
}: CardViewerActionsProps) {
  const t = useTranslations('card');
  const tNote = useTranslations('card.note');
  const tBookmark = useTranslations('card.bookmark');
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: mine } = useMyResonance(cardId);
  const { data: me } = useMyProfile();
  const prefill = usePrefillCard();
  const [picking, setPicking] = useState(false);

  // Bookmark status sync for SegmentedActionBar segment
  const { data: activeBookmark, mutate: mutateBookmark } = useSWR(
    user ? `bookmark:${cardId}:${user.id}` : null,
    () => isBookmarked(cardId),
  );

  if (loading) return null;
  // The author of the original can't resonate with their own card.
  if (user && user.id === author.id) return null;

  const hasResonance = !!mine;
  // A published resonance is done: the button says so and opens it. A draft
  // is still being written: 修改 takes it back to the writer.
  const resonated = !!mine?.publishedAt;
  // SWR reports `undefined` while the viewer's resonance card is still loading;
  // wait so we don't accidentally start a second one.
  const loadingMine = !!user && mine === undefined;
  const label = resonated ? t('resonated') : hasResonance ? t('modify') : t('resonate');
  const glyph = resonated ? 'check' : hasResonance ? 'pen' : 'wave';

  function onTrigger() {
    if (!user) {
      router.push('/signin');
      return;
    }
    if (mine) {
      if (mine.publishedAt) {
        prefill(mine, me ?? undefined);
        router.push(`/card/${mine.slug ?? mine.id}`);
      } else {
        router.push(`/write/${mine.id}`);
      }
      return;
    }
    // Write a new card, or pick one already written.
    setPicking(true);
  }

  function handleBookmarkClick() {
    if (!user) {
      router.push('/signin');
      return;
    }
    const saving = !activeBookmark;
    void mutateBookmark(
      async () => toggleBookmark(cardId),
      { optimisticData: saving, revalidate: false },
    );
  }

  const segments: SegmentSpec[] = [
    {
      key: 'resonate',
      icon: <Icon name={glyph} size={16} />,
      label,
      fill: 'var(--button-fill)',
      textColor: 'var(--color-cream)',
      hoverOverlay: 'oklch(0% 0 0 / 0.14)',
      onClick: onTrigger,
    },
    {
      key: 'note',
      icon: <Icon name="note" size={16} />,
      // Its name is the words on screen (the hidden form is left out of it):
      // someone speaking to a voice control says what they see.
      label: (
        <>
          <span className={styles.wide}>{tNote('entry')}</span>
          <span className={styles.narrow}>{tNote('entryShort')}</span>
        </>
      ),
      hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)',
      onClick: onOpenNote,
    },
    {
      key: 'bookmark',
      icon: (
        <Icon
          name="bookmark"
          size={16}
          strokeWidth={activeBookmark ? 2 : 1.6}
          fill={activeBookmark ? 'currentColor' : undefined}
        />
      ),
      label: activeBookmark ? tBookmark('remove') : tBookmark('add'),
      hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)',
      onClick: handleBookmarkClick,
      collapsible: true,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.bar} data-waiting={loadingMine || undefined}>
        <SegmentedActionBar segments={segments} />
      </div>

      {picking && (
        <ResonatePicker
          open
          onClose={() => setPicking(false)}
          targetId={cardId}
          targetReferenceId={referenceCardId}
        />
      )}
    </div>
  );
}
