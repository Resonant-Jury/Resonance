'use client';

import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { BookmarkButton } from '@/components/atoms/BookmarkButton/BookmarkButton';
import { SegmentedActionBar, type SegmentSpec } from '@/components/molecules/SegmentedActionBar/SegmentedActionBar';
import { useRouter } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyResonance } from '@/lib/data/hooks';
import { isBookmarked, toggleBookmark } from '@/lib/db/firestore/client/bookmarks';
import styles from './CardViewerActions.module.css';

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
  onOpenNote: () => void;
}

/**
 * The response action bar on the card detail page.
 * Uses SegmentedActionBar for a fused horizontal layout on desktop,
 * and falls back to a clean, vertically stacked layout on mobile screens.
 */
export function CardViewerActions({
  cardId,
  author,
  onOpenNote,
}: CardViewerActionsProps) {
  const t = useTranslations('card');
  const tNote = useTranslations('card.note');
  const tBookmark = useTranslations('card.bookmark');
  const router = useRouter();
  const { user, loading } = useAuth();
  const { data: mine } = useMyResonance(cardId);

  // Bookmark status sync for SegmentedActionBar segment
  const { data: activeBookmark, mutate: mutateBookmark } = useSWR(
    user ? `bookmark:${cardId}:${user.id}` : null,
    () => isBookmarked(cardId),
  );

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

  // Segment specifications for SegmentedActionBar (desktop layout)
  const segments: SegmentSpec[] = [
    {
      key: 'resonate',
      icon: <Icon name={hasResonance ? 'pen' : 'wave'} size={16} />,
      label: hasResonance ? t('modify') : t('resonate'),
      fill: 'var(--color-terracotta)',
      textColor: 'var(--color-cream)',
      hoverOverlay: 'oklch(0% 0 0 / 0.14)',
      onClick: onTrigger,
    },
    {
      key: 'note',
      icon: <Icon name="note" size={16} />,
      label: tNote('entry'),
      textColor: 'var(--color-terracotta)',
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
      textColor: 'var(--color-terracotta)',
      hoverOverlay: 'color-mix(in oklch, var(--color-terracotta) 14%, transparent)',
      onClick: handleBookmarkClick,
    },
  ];

  return (
    <div className={styles.container}>
      {/* Desktop view: Unified segmented action bar */}
      <div className={styles.desktopOnly} style={{ opacity: loadingMine ? 0.6 : 1, pointerEvents: loadingMine ? 'none' : 'auto' }}>
        <SegmentedActionBar segments={segments} />
      </div>

      {/* Mobile view: Stacked layout with text hyperlink note button */}
      <div className={styles.mobileOnly}>
        <div style={{ opacity: loadingMine ? 0.6 : 1, pointerEvents: loadingMine ? 'none' : 'auto' }}>
          <OrganicButton variant={hasResonance ? 'outline' : 'primary'} onClick={onTrigger}>
            <Icon name={hasResonance ? 'pen' : 'wave'} size={16} style={{ marginTop: 1 }} />
            {hasResonance ? t('modify') : t('resonate')}
          </OrganicButton>
        </div>
        <div className={styles.mobileActionsRow}>
          <OrganicButton
            variant="secondaryOutline"
            className={styles.mobileNoteButton}
            onClick={onOpenNote}
          >
            <Icon name="note" size={16} />
            {tNote('entry')}
          </OrganicButton>
          <BookmarkButton cardId={cardId} />
        </div>
      </div>
    </div>
  );
}
