'use client';

import { createContext, useContext } from 'react';
import useSWR from 'swr';
import { useAuth } from '@/components/providers/AuthProvider';
import { cardKey } from '@/lib/data/cardPrefill';
import { fetchCardView, useMyBlockedIds, type CardEmbedSource, type CardView } from '@/lib/data/hooks';
import type { Card, User } from '@/lib/db/types';

export type CardEmbedData =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; card: Card; author: User | null };

/** Extracts the slug-or-id segment from a `/card/...` href. */
export function cardKeyFromHref(href: string): string | null {
  const m = href.match(/^\/card\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Cards a page already has for the embeds it draws — a signed-in card page's
 * `include=embeds` (useCardPageLists): one /api/v1 request, the server having
 * applied the viewer's visibility and blocks — so its embeds look themselves
 * up here instead of each reading its own card. Without a source (null), an
 * embed reads its card itself.
 */
export const CardEmbedSourceContext = createContext<CardEmbedSource | null>(null);

/** An embed from the page's source: matched on the card's slug or id; none there is a card the viewer can't read. */
function fromSource(source: CardEmbedSource, key: string | null): CardEmbedData {
  if (!key) return { status: 'error' };
  if (source.status === 'loading') return { status: 'loading' };
  const card = source.cards.cards.find((c) => c.slug === key || c.id === key);
  if (!card) return { status: 'error' };
  return { status: 'ready', card, author: card.anonymous ? null : (source.cards.authors[card.authorId] ?? null) };
}

/**
 * Resolves an in-article card link (`/card/<slug-or-id>`) to the live card +
 * author. On a page that already fetched its embeds (CardEmbedSourceContext)
 * it is looked up there. Otherwise it is read through the same
 * visibility-enforced client path as the card page — and under the card
 * page's own SWR key, so the same card embedded twice (or shared again in a
 * thread) is read once, and opening it starts from what the embed read.
 * Cards the viewer can't see (private / deleted) and cards by someone the
 * viewer blocked resolve to `error`, letting callers fall back to a plain
 * link. Someone else's anonymous card has no author (its profile is never
 * downloaded).
 */
export function useCardEmbed(href: string): CardEmbedData {
  const key = cardKeyFromHref(href);
  const source = useContext(CardEmbedSourceContext);
  const read = useReadCardEmbed(source ? null : key);
  return source ? fromSource(source, key) : read;
}

function useReadCardEmbed(key: string | null): CardEmbedData {
  // Like the card page, wait for auth to settle: a connections-only card read
  // mid-restore would come back "not visible" and stay cached that way.
  const { user, loading } = useAuth();
  const { data, error } = useSWR<CardView | null>(key && !loading ? cardKey(key, user?.id) : null, () =>
    fetchCardView(key!, user?.id),
  );
  const { data: blocked } = useMyBlockedIds();

  if (!key || error || data === null) return { status: 'error' };
  // A signed-in viewer's embed waits for their block list as well.
  if (data === undefined || (user && !blocked)) return { status: 'loading' };
  const { card } = data;
  if (card.authorId !== user?.id && blocked?.has(card.authorId)) return { status: 'error' };
  const anonymous = card.anonymous && card.authorId !== user?.id;
  return { status: 'ready', card, author: anonymous ? null : data.author };
}
