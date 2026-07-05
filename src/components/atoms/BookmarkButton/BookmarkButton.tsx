'use client';

import { useEffect, useRef, useState } from 'react';
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

/** How long the「已收藏」confirmation lingers next to the icon. */
const SAVED_TOAST_MS = 3000;

/**
 * The quietest of the three response actions: a bookmark toggle. One click,
 * no confirmation, no count, no notification — it speaks only to yourself.
 * Zero risk means it needs zero explanation, so it's just an icon; the only
 * feedback is the ribbon filling in and a brief「已收藏」that fades on its own.
 */
export function BookmarkButton({ cardId, size = 20 }: BookmarkButtonProps) {
  const t = useTranslations('card.bookmark');
  const router = useRouter();
  const { user } = useAuth();
  const { data: active, mutate } = useSWR(
    user ? `bookmark:${cardId}:${user.id}` : null,
    () => isBookmarked(cardId),
  );
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  function onClick() {
    if (!user) {
      router.push('/signin');
      return;
    }
    const saving = !active;
    setJustSaved(saving);
    clearTimeout(savedTimer.current);
    if (saving) savedTimer.current = setTimeout(() => setJustSaved(false), SAVED_TOAST_MS);
    // Optimistic flip; reconcile with the write's actual result.
    void mutate(
      async () => toggleBookmark(cardId),
      { optimisticData: saving, revalidate: false },
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
        <Icon
          name="bookmark"
          size={size}
          strokeWidth={active ? 2 : 1.6}
          fill={active ? 'currentColor' : undefined}
        />
      </button>
      <span
        role="status"
        style={{
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          color: 'var(--color-terracotta)',
          opacity: justSaved && active ? 1 : 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {justSaved && active ? t('saved') : ''}
      </span>
    </span>
  );
}
