'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import type { Card, User } from '@/lib/db/types';

/**
 * The SWR key the card page ({@link useCard}) reads a card under: its URL
 * segment (slug, or a legacy doc id) and the viewer, since what a card shows
 * depends on who is looking.
 */
export function cardKey(slugOrId: string, viewerId: string | undefined): string {
  return `card:${slugOrId}:${viewerId ?? 'anon'}`;
}

/** The author shown for someone else's anonymous card: its uid (already on the card) and nothing else. */
export function anonymousAuthor(card: Card): User {
  return {
    id: card.authorId,
    handle: '',
    region: '',
    primaryLocale: card.originalLocale,
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: String((card.id.charCodeAt(0) ?? 7) * 31),
    initials: '·',
    accentColor: 'var(--color-cream-dark)',
    joinedAt: new Date(0),
    handleChangedAt: new Date(0),
  };
}

/**
 * Seed the card page's cache from a card the reader just clicked in a list,
 * so the page opens on its title, cover and story instead of a skeleton. The
 * page still reads the card itself (SWR revalidates on mount), and a page
 * already in the cache is left as it is.
 */
export function usePrefillCard(): (card: Card, author: User | undefined) => void {
  const { user, loading } = useAuth();
  const { cache, mutate } = useSWRConfig();
  const viewerId = user?.id;
  return useCallback(
    (card, author) => {
      // Until auth settles the page's key isn't known yet.
      if (loading) return;
      // A summary holds an excerpt, not the story: the page reads the card
      // itself (a public one is in its server render anyway).
      if (card.summary) return;
      // Someone else's anonymous card: the page shows the anonymous byline,
      // exactly what the list had. The viewer's own anonymous card: the list
      // didn't read its author, so there is nothing to seed with.
      const shown = card.anonymous ? (card.authorId === viewerId ? undefined : anonymousAuthor(card)) : author;
      if (!shown) return;
      const key = cardKey(card.slug ?? card.id, viewerId);
      if (cache.get(key)?.data !== undefined) return;
      void mutate(key, { card, author: shown }, { revalidate: false });
    },
    [cache, loading, mutate, viewerId],
  );
}
