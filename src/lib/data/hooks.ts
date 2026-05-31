'use client';

import useSWR from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import type { Card, CardBoxTab, User } from '@/lib/db';
import {
  getCardById,
  getCardsByAuthor,
  getCurrentUserProfile,
  getLatestPublishedFeed,
  getRelatedCards,
  getUserById,
  getUserByHandle,
  getUsersByIds,
  isConnected,
} from '@/lib/db/firestore/client/reads';
import { remainingDailyQuota } from '@/lib/db/firestore/client/invites';

export interface CardsWithAuthors {
  cards: Card[];
  authors: Record<string, User>;
}

async function withAuthors(cards: Card[]): Promise<CardsWithAuthors> {
  const authors = await getUsersByIds(cards.map((c) => c.authorId));
  return { cards, authors };
}

/** Latest public feed for the home page. */
export function useFeed() {
  return useSWR<CardsWithAuthors>('feed:latest', async () => {
    const cards = await getLatestPublishedFeed(12);
    return withAuthors(cards);
  });
}

/** A single card plus its author. `data === null` means not found / not visible. */
export function useCard(id: string | undefined) {
  return useSWR(id ? `card:${id}` : null, async () => {
    const card = await getCardById(id!);
    if (!card) return null;
    const author = await getUserById(card.authorId);
    return { card, author };
  });
}

/** Cards related to the given card, with authors. */
export function useRelated(id: string | undefined) {
  return useSWR<CardsWithAuthors>(id ? `related:${id}` : null, async () => {
    const cards = await getRelatedCards(id!, 3);
    return withAuthors(cards);
  });
}

/** The signed-in viewer's own profile. */
export function useMyProfile() {
  const { user } = useAuth();
  return useSWR(user ? `profile:${user.id}` : null, () => getCurrentUserProfile());
}

export interface MyCardBox {
  published: Card[];
  private: Card[];
  draft: Card[];
  resonated: Card[];
  authors: Record<string, User>;
}

/** The four card-box tabs for the signed-in viewer, plus resolved authors. */
export function useMyCardBox() {
  const { user } = useAuth();
  return useSWR<MyCardBox>(user ? `cardbox:${user.id}` : null, async () => {
    const uid = user!.id;
    const tabs: CardBoxTab[] = ['published', 'private', 'draft', 'resonated'];
    const [published, priv, draft, resonated] = await Promise.all(
      tabs.map((tab) => getCardsByAuthor(uid, tab))
    );
    const all = [...published, ...priv, ...draft, ...resonated];
    const authors = await getUsersByIds(all.map((c) => c.authorId));
    return { published, private: priv, draft, resonated, authors };
  });
}

export interface PublicProfile {
  user: User | null;
  isConnected: boolean;
  published: Card[];
  dailyRemaining: number;
}

/** Another user's public profile, viewed by the signed-in viewer. */
export function useProfileByHandle(handle: string | undefined) {
  const { user: viewer } = useAuth();
  const key = handle && viewer ? `pubprofile:${handle}:${viewer.id}` : null;
  return useSWR<PublicProfile>(key, async () => {
    const user = await getUserByHandle(handle!);
    if (!user || user.id === viewer!.id) {
      return { user: null, isConnected: false, published: [], dailyRemaining: 0 };
    }
    const [connected, published, dailyRemaining] = await Promise.all([
      isConnected(viewer!.id, user.id),
      getCardsByAuthor(user.id, 'published'),
      remainingDailyQuota(),
    ]);
    return { user, isConnected: connected, published, dailyRemaining };
  });
}
