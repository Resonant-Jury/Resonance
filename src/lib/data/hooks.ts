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
  // The feed lists only public cards, which Firestore rules allow anonymously,
  // so it can fetch immediately regardless of auth state — no need to wait on
  // the client SDK's async auth restoration.
  return useSWR<CardsWithAuthors>('feed:latest', async () => {
    const cards = await getLatestPublishedFeed(12);
    return withAuthors(cards);
  });
}

/** A single card plus its author. `data === null` means not found / not visible. */
export function useCard(id: string | undefined) {
  // A card may be public (anonymous-readable) or private/connections (only its
  // owner / connected viewers). Wait for auth to *settle* before fetching:
  // firing during the client SDK's async auth restoration would read as an
  // anonymous viewer and 404 the owner's own private card, which SWR would then
  // cache against a static key. Re-keying on the viewer id also refetches with
  // the right permissions when the viewer signs in or out.
  const { user, loading } = useAuth();
  const key = id && !loading ? `card:${id}:${user?.id ?? 'anon'}` : null;
  const swr = useSWR(key, async () => {
    const card = await getCardById(id!);
    if (!card) return null;
    const author = await getUserById(card.authorId);
    return { card, author };
  });
  // While auth is still settling (or we have no id yet) the SWR key is null, so
  // SWR reports isLoading=false with data=undefined — which would briefly render
  // the "not found" state before the real fetch begins. Treat that pre-fetch
  // window as loading so the skeleton shows first.
  return { ...swr, isLoading: swr.isLoading || (!!id && key === null) };
}

/** Cards related to the given card, with authors. */
export function useRelated(id: string | undefined) {
  // Related cards come from the public feed, so this is anonymous-readable and
  // can fetch as soon as we have a card id.
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
