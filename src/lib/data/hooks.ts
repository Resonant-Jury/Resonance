'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { useAuth } from '@/components/providers/AuthProvider';
import type { Card, CardBoxTab, User } from '@/lib/db';
import {
  getCardById,
  getCardBySlugOrId,
  getCardsByAuthor,
  getCurrentUserProfile,
  getLatestPublishedFeed,
  getMyResonanceCard,
  getPublicCardsByAuthor,
  getRelatedCards,
  getResonanceCards,
  getUserById,
  hasAnyOwnCards,
  getUserByHandle,
  getUsersByIds,
  isConnected,
  listMyConnectionUids,
} from '@/lib/db/firestore/client/reads';
import { listLinksToAuthor, listLinksToCard } from '@/lib/db/firestore/client/cardLinks';
import { listMyBookmarkIds } from '@/lib/db/firestore/client/bookmarks';
import { loadMyThoughtMap, type ThoughtMapData } from '@/lib/db/firestore/client/thoughtMap';
import { listConversations, listenThread } from '@/lib/db/firestore/client/messages';
import type { Conversation, Message } from '@/lib/db/types';

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

export interface RecommendedFeed extends CardsWithAuthors {
  /** cardId → 「為什麼這篇可能對你有共鳴」 one-liner from the funnel. */
  reasons: Record<string, string>;
}

/**
 * The signed-in viewer's personalized「為你共振」feed. Fetches the funnel's
 * result (card ids + resonance reasons) from the server, then resolves each
 * card through the visibility-enforced read path. Gated on a signed-in viewer —
 * the API requires auth, and an anonymous user has no profile to match from.
 */
export function useRecommendedFeed() {
  const { user, loading } = useAuth();
  return useSWR<RecommendedFeed>(user && !loading ? `feed:recommended:${user.id}` : null, async () => {
    const res = await fetch('/api/recommend/feed');
    if (!res.ok) return { cards: [], authors: {}, reasons: {} };
    const { items } = (await res.json()) as { items: { cardId: string; reason: string }[] };
    const cards = await cardsFromIds(items.map((i) => i.cardId));
    const reasons: Record<string, string> = {};
    for (const item of items) reasons[item.cardId] = item.reason;
    const { authors } = await withAuthors(cards);
    return { cards, authors, reasons };
  });
}

const FEED_PAGE_SIZE = 12;

export interface FeedState {
  data?: CardsWithAuthors;
  isLoading: boolean;
  /** A further page is currently being fetched (the "load more" spinner). */
  isLoadingMore: boolean;
  /** False once the newest fetch came back short — the feed is exhausted. */
  hasMore: boolean;
  loadMore: () => void;
}

/** Latest public feed for the home page, paginated by publishedAt cursor. */
export function useFeed(): FeedState {
  // The feed lists only public cards, which Firestore rules allow anonymously,
  // so it can fetch immediately regardless of auth state — no need to wait on
  // the client SDK's async auth restoration.
  const { data, isLoading, size, setSize } = useSWRInfinite<CardsWithAuthors>(
    (index, prev: CardsWithAuthors | null) => {
      // A short page means Firestore ran out — stop asking for more.
      if (prev && prev.cards.length < FEED_PAGE_SIZE) return null;
      if (index === 0) return ['feed:latest', null];
      const last = prev!.cards[prev!.cards.length - 1];
      return ['feed:latest', last.publishedAt!.getTime()];
    },
    async ([, cursorMs]: [string, number | null]) => {
      const cards =
        cursorMs === null
          ? await getLatestPublishedFeed(FEED_PAGE_SIZE)
          : await getLatestPublishedFeed(FEED_PAGE_SIZE, new Date(cursorMs));
      return withAuthors(cards);
    },
  );

  const pages = data ?? [];
  const merged: CardsWithAuthors | undefined =
    pages.length > 0
      ? {
          cards: pages.flatMap((p) => p.cards),
          authors: Object.assign({}, ...pages.map((p) => p.authors)),
        }
      : undefined;
  return {
    data: merged,
    isLoading,
    isLoadingMore: size > pages.length,
    hasMore: pages.length > 0 && pages[pages.length - 1].cards.length === FEED_PAGE_SIZE,
    loadMore: () => void setSize((s) => s + 1),
  };
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

/**
 * Whether the signed-in viewer has written any card yet — `undefined` while
 * loading, `false` only once we know they haven't. Anonymous viewers resolve
 * to `true` (they get the sign-in prompt elsewhere, not the first-card guide).
 */
export function useHasWrittenCards() {
  const { user, loading } = useAuth();
  return useSWR<boolean>(
    !loading ? `hasCards:${user?.id ?? 'anon'}` : null,
    () => (user ? hasAnyOwnCards() : true)
  );
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
  /** Cards the viewer bookmarked — purely private, visible only here. */
  bookmarks: Card[];
  authors: Record<string, User>;
}

/** The card-box tabs for the signed-in viewer, plus resolved authors. */
export function useMyCardBox() {
  const { user } = useAuth();
  return useSWR<MyCardBox>(user ? `cardbox:${user.id}` : null, async () => {
    const uid = user!.id;
    const tabs: CardBoxTab[] = ['published', 'private', 'draft', 'resonated'];
    const [[published, priv, draft, resonated], links, bookmarkIds] = await Promise.all([
      Promise.all(tabs.map((tab) => getCardsByAuthor(uid, tab))),
      listLinksToAuthor(uid),
      listMyBookmarkIds(),
    ]);
    const [linked, bookmarks] = await Promise.all([
      cardsFromIds(links.map((l) => l.sourceCardId)),
      // A bookmarked card that has since gone private simply drops out.
      cardsFromIds(bookmarkIds),
    ]);
    const all = [...published, ...priv, ...draft, ...resonated, ...linked, ...bookmarks];
    const authors = await getUsersByIds(all.map((c) => c.authorId));
    return { published, private: priv, draft, resonated, linked, bookmarks, authors };
  });
}

export interface MyThoughtMap extends ThoughtMapData {
  /** Every card placeable on the map (own published / private / draft, plus
   * the originals the viewer resonated with), keyed by id — drives both node
   * rendering and the "add a card" tray. */
  cards: Record<string, Card>;
  /** Ids of cards the viewer doesn't own but resonated with — the tray marks
   * these with the resonance glyph instead of the card/pen icon. */
  resonatedIds: string[];
}

/** The signed-in viewer's thought map plus their own + resonated cards. */
export function useMyThoughtMap() {
  const { user } = useAuth();
  return useSWR<MyThoughtMap>(user ? `thoughtmap:${user.id}` : null, async () => {
    const uid = user!.id;
    const [map, published, priv, draft, resonated] = await Promise.all([
      loadMyThoughtMap(),
      getCardsByAuthor(uid, 'published'),
      getCardsByAuthor(uid, 'private'),
      getCardsByAuthor(uid, 'draft'),
      getCardsByAuthor(uid, 'resonated'),
    ]);
    const cards: Record<string, Card> = {};
    // Resonated originals first so an own card by the same id (self-reference)
    // keeps its own-card entry.
    for (const c of [...resonated, ...published, ...priv, ...draft]) cards[c.id] = c;
    const resonatedIds = resonated.map((c) => c.id).filter((id) => cards[id].authorId !== uid);
    // Drop nodes whose card has been deleted since being placed on the map.
    return { ...map, nodes: map.nodes.filter((n) => cards[n.cardId]), cards, resonatedIds };
  });
}

/**
 * Public cards that resonate with (reference) a card, with their authors.
 * Anonymous-readable — drives the card-detail resonance section.
 */
export function useResonanceCards(cardId: string | undefined) {
  return useSWR<CardsWithAuthors>(cardId ? `resonanceCards:${cardId}` : null, async () => {
    const cards = await getResonanceCards(cardId!);
    return withAuthors(cards);
  });
}

/**
 * The original card that a resonance (response) card references, with its
 * author — wrapped as {@link CardsWithAuthors} (zero or one card) so it can feed
 * the same {@link MiniCardGrid} as the incoming resonance list. Anonymous-
 * readable; resolves to an empty list when the original is missing or private.
 */
export function useReferencedCard(cardId: string | undefined) {
  return useSWR<CardsWithAuthors>(cardId ? `referencedCard:${cardId}` : null, async () => {
    const card = await getCardById(cardId!);
    return withAuthors(card ? [card] : []);
  });
}

/**
 * The signed-in viewer's own resonance card for a given original (draft or
 * published), or null. Re-keys on the viewer so it refreshes on sign-in/out.
 * Drives the「共振 / 修改」button and prefills the inline editor.
 */
export function useMyResonance(cardId: string | undefined) {
  const { user, loading } = useAuth();
  const key = cardId && user && !loading ? `myResonance:${cardId}:${user.id}` : null;
  return useSWR<Card | null>(key, () => getMyResonanceCard(cardId!));
}

/**
 * The people who resonated with a card, newest first — derived from the public
 * resonance cards. Author-only surface, so the caller gates this on
 * `viewer.id === authorId` by passing `undefined` otherwise.
 */
export function useResonators(cardId: string | undefined, referenceCardId?: string) {
  return useSWR<User[]>(cardId ? `resonators:${cardId}:${referenceCardId ?? 'none'}` : null, async () => {
    const cards = await getResonanceCards(cardId!);
    const authors = await getUsersByIds(cards.map((c) => c.authorId));
    // One avatar per unique resonator, in card (newest-first) order.
    const seen = new Set<string>();
    const out: User[] = [];

    // If there is a referenced card, add its author first (parent card is older/source)
    if (referenceCardId) {
      const refCard = await getCardById(referenceCardId);
      if (refCard && !refCard.anonymous) {
        const refAuthor = await getUserById(refCard.authorId);
        if (refAuthor) {
          seen.add(refAuthor.id);
          out.push(refAuthor);
        }
      }
    }

    for (const c of cards) {
      // An anonymous resonance card must not put a face in the avatar row.
      if (c.anonymous) continue;
      if (seen.has(c.authorId)) continue;
      seen.add(c.authorId);
      const u = authors[c.authorId];
      if (u) out.push(u);
    }
    return out;
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

export interface ConversationsData {
  conversations: Conversation[];
  /** The other participant of each conversation, keyed by uid. */
  people: Record<string, User>;
  /** Connected users with no conversation yet — the "start one" list. */
  connectedWithoutConversation: User[];
  /** Sum of the viewer's unread counters — drives the header badge. */
  unreadTotal: number;
}

/**
 * The signed-in viewer's conversation list plus connected people they haven't
 * talked to yet. Polls at the caller-provided interval (the open thread itself
 * is realtime via {@link useThread} — this only feeds the list and badges).
 */
export function useConversations(refreshInterval = 30_000) {
  const { user, loading } = useAuth();
  return useSWR<ConversationsData>(
    user && !loading ? `conversations:${user.id}` : null,
    async () => {
      const uid = user!.id;
      const [conversations, connectionUids] = await Promise.all([
        listConversations(),
        listMyConnectionUids(),
      ]);
      const otherUids = conversations.map((c) => c.participants.find((p) => p !== uid) ?? '');
      const people = await getUsersByIds([...otherUids, ...connectionUids]);
      const talked = new Set(otherUids);
      const connectedWithoutConversation = connectionUids
        .filter((id) => !talked.has(id))
        .map((id) => people[id])
        .filter((u): u is User => Boolean(u));
      const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread[uid] ?? 0), 0);
      return { conversations, people, connectedWithoutConversation, unreadTotal };
    },
    { refreshInterval },
  );
}

export interface ThreadState {
  messages: Message[];
  /** False until the first snapshot arrives. */
  ready: boolean;
  error: Error | null;
}

/**
 * Realtime subscription to an open conversation's messages (oldest → newest).
 * The project's only onSnapshot surface — deliberately scoped to the single
 * thread the viewer has open; the conversation list and badges poll via SWR.
 */
export function useThread(pairId: string | undefined): ThreadState {
  const { user, loading } = useAuth();
  const [state, setState] = useState<ThreadState>({ messages: [], ready: false, error: null });

  useEffect(() => {
    if (!pairId || !user || loading) return;
    setState({ messages: [], ready: false, error: null });
    const unsubscribe = listenThread(
      pairId,
      (messages) => setState({ messages, ready: true, error: null }),
      (error) => setState((prev) => ({ ...prev, ready: true, error })),
    );
    return unsubscribe;
  }, [pairId, user, loading]);

  return state;
}

export interface PublicProfile {
  user: User | null;
  /** True when the signed-in viewer is looking at their own public page. */
  isSelf: boolean;
  isConnected: boolean;
  published: Card[];
  /** Cards that other people linked to one of this user's cards. */
  linked: Card[];
  linkedAuthors: Record<string, User>;
}

const emptyProfile: PublicProfile = {
  user: null,
  isSelf: false,
  isConnected: false,
  published: [],
  linked: [],
  linkedAuthors: {},
};

/**
 * A user's outward-facing, blog-style profile keyed by handle.
 *
 * Works for anonymous visitors as well as signed-in viewers: the profile and
 * its public cards are anonymous-readable, so the SWR key only waits for auth
 * to *settle* (not for a viewer to exist). It re-keys on the viewer id so
 * connection state and the self/visitor distinction refresh on sign-in/out.
 * The connection lookup is only fetched when a non-owner viewer is signed in
 * (that read requires auth).
 */
export function useProfileByHandle(handle: string | undefined) {
  const { user: viewer, loading } = useAuth();
  const key = handle && !loading ? `pubprofile:${handle}:${viewer?.id ?? 'anon'}` : null;
  return useSWR<PublicProfile>(key, async () => {
    const user = await getUserByHandle(handle!);
    if (!user) return emptyProfile;

    const isSelf = !!viewer && viewer.id === user.id;
    const [published, links] = await Promise.all([
      getPublicCardsByAuthor(user.id),
      listLinksToAuthor(user.id),
    ]);
    const connected = viewer && !isSelf ? await isConnected(viewer.id, user.id) : false;
    const linked = await cardsFromIds(links.map((l) => l.sourceCardId));
    const linkedAuthors = await getUsersByIds(linked.map((c) => c.authorId));
    return { user, isSelf, isConnected: connected, published, linked, linkedAuthors };
  });
}
