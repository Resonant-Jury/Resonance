'use client';

import useSWR from 'swr';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRouter } from '@/i18n/navigation';
import { isBookmarked, toggleBookmark } from '@/lib/db/firestore/client/bookmarks';

export interface BookmarkButtonProps {
  cardId: string;
  size?: number;
}

/**
 * The quietest of the three response actions: a bookmark toggle. One click,
 * no confirmation, no count, no notification — it speaks only to yourself.
 * Zero risk means it needs zero explanation, so it's just an icon.
 */
export function BookmarkButton({ cardId, size = 20 }: BookmarkButtonProps) {
  const t = useTranslations('card.bookmark');
  const router = useRouter();
  const { user } = useAuth();
  const { data: active, mutate } = useSWR(
    user ? `bookmark:${cardId}:${user.id}` : null,
    () => isBookmarked(cardId),
  );

  function onClick() {
    if (!user) {
      router.push('/signin');
      return;
    }
    // Optimistic flip; reconcile with the write's actual result.
    void mutate(
      async () => toggleBookmark(cardId),
      { optimisticData: !active, revalidate: false },
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      aria-label={active ? t('remove') : t('add')}
      title={active ? t('remove') : t('add')}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 6,
        display: 'inline-flex',
        alignItems: 'center',
        color: active ? 'var(--color-terracotta)' : 'var(--color-text-muted)',
      }}
    >
      <Icon name="bookmark" size={size} strokeWidth={active ? 2.4 : 1.6} />
    </button>
  );
}
