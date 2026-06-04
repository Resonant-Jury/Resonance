'use client';

import useSWR from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import type { Card, CardBoxTab, Comment, User } from '@/lib/db';
import {
  getCardById,
  getCardBySlugOrId,
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
import { listComments } from '@/lib/db/firestore/client/comments';
import { listResonators } from '@/lib/db/firestore/client/resonances';
import { listLinksToAuthor, listLinksToCard } from '@/lib/db/firestore/client/cardLinks';

export interface CardsWithAuthors {
  cards: Card[];
  authors: Record<string, User>;
}

async function withAuthors(cards: Card[]): Promise<CardsWithAuthors> {
  const authors = await getUsersByIds(cards.map((c) => c.authorId));
  return { cards, authors };
}

/** Resolve a list of source card ids → visible cards (private/denied drop out). */
async function cardsFromIds(ids: string[]): Promise<Card[]> {
  const cards = await Promise.all(ids.map((id) => getCardById(id)));
  return cards.filter((c): c is Card => Boolean(c));
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

/**
 * A single card plus its author, keyed by URL segment (slug or legacy doc id).
 * `data === null` means not found / not visible.
 */
export function useCard(slugOrId: string | undefined) {
  // A card may be public (anonymous-readable) or private/connections (only its
  // owner / connected viewers). Wait for auth to *settle* before fetching:
  // firing during the client SDK's async auth restoration would read as an
  // anonymous viewer and 404 the owner's own private card, which SWR would then
  // cache against a static key. Re-keying on the viewer id also refetches with
  // the right permissions when the viewer signs in or out.
  const { user, loading } = useAuth();
  const key = slugOrId && !loading ? `card:${slugOrId}:${user?.id ?? 'anon'}` : null;
  const swr = useSWR(key, async () => {
    const card = await getCardBySlugOrId(slugOrId!);
    if (!card) return null;
    const author = await getUserById(card.authorId);
    return { card, author };
  });
  // While auth is still settling (or we have no id yet) the SWR key is null, so
  // SWR reports isLoading=false with data=undefined — which would briefly render
  // the "not found" state before the real fetch begins. Treat that pre-fetch
  // window as loading so the skeleton shows first.
  return { ...swr, isLoading: swr.isLoading || (!!slugOrId && key === null) };
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
  /** Cards that other people linked to one of my cards (via "link with a card"). */
  linked: Card[];
  authors: Record<string, User>;
}

/** The card-box tabs for the signed-in viewer, plus resolved authors. */
export function useMyCardBox() {
  const { user } = useAuth();
  return useSWR<MyCardBox>(user ? `cardbox:${user.id}` : null, async () => {
    const uid = user!.id;
    const tabs: CardBoxTab[] = ['published', 'private', 'draft', 'resonated'];
    const [[published, priv, draft, resonated], links] = await Promise.all([
      Promise.all(tabs.map((tab) => getCardsByAuthor(uid, tab))),
      listLinksToAuthor(uid),
    ]);
    const linked = await cardsFromIds(links.map((l) => l.sourceCardId));
    const all = [...published, ...priv, ...draft, ...resonated, ...linked];
    const authors = await getUsersByIds(all.map((c) => c.authorId));
    return { published, private: priv, draft, resonated, linked, authors };
  });
}

/** Comments on a card (everyone-readable), with the commenters' profiles. */
export interface CommentsWithAuthors {
  comments: Comment[];
  authors: Record<string, User>;
}
export function useComments(cardId: string | undefined) {
  return useSWR<CommentsWithAuthors>(cardId ? `comments:${cardId}` : null, async () => {
    const comments = await listComments(cardId!);
    const authors = await getUsersByIds(comments.map((c) => c.authorId));
    return { comments, authors };
  });
}

/**
 * The people who resonated with a card, newest first — author-only data, so the
 * caller gates this on `viewer.id === authorId` by passing `undefined` otherwise.
 */
export function useResonators(cardId: string | undefined) {
  return useSWR<User[]>(cardId ? `resonators:${cardId}` : null, async () => {
    const ids = await listResonators(cardId!);
    const authors = await getUsersByIds(ids);
    return ids.map((id) => authors[id]).filter((u): u is User => Boolean(u));
  });
}

/** Cards that others linked to a specific card (author's card-detail view). */
export function useLinkedToCard(cardId: string | undefined) {
  return useSWR<CardsWithAuthors>(cardId ? `linksTo:${cardId}` : null, async () => {
    const links = await listLinksToCard(cardId!);
    const cards = await cardsFromIds(links.map((l) => l.sourceCardId));
    return withAuthors(cards);
  });
}

export interface PublicProfile {
  user: User | null;
  isConnected: boolean;
  published: Card[];
  /** Cards that other people linked to one of this user's cards. */
  linked: Card[];
  linkedAuthors: Record<string, User>;
  dailyRemaining: number;
}

/** Another user's public profile, viewed by the signed-in viewer. */
export function useProfileByHandle(handle: string | undefined) {
  const { user: viewer } = useAuth();
  const key = handle && viewer ? `pubprofile:${handle}:${viewer.id}` : null;
  return useSWR<PublicProfile>(key, async () => {
    const user = await getUserByHandle(handle!);
    if (!user || user.id === viewer!.id) {
      return {
        user: null,
        isConnected: false,
        published: [],
        linked: [],
        linkedAuthors: {},
        dailyRemaining: 0,
      };
    }
    const [connected, published, links, dailyRemaining] = await Promise.all([
      isConnected(viewer!.id, user.id),
      getCardsByAuthor(user.id, 'published'),
      listLinksToAuthor(user.id),
      remainingDailyQuota(),
    ]);
    const linked = await cardsFromIds(links.map((l) => l.sourceCardId));
    const linkedAuthors = await getUsersByIds(linked.map((c) => c.authorId));
    return { user, isConnected: connected, published, linked, linkedAuthors, dailyRemaining };
  });
}
