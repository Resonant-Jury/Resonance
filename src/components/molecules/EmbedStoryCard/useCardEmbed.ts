'use client';

import { useEffect, useState } from 'react';
import { getCardBySlugOrId, getUserById } from '@/lib/db/firestore/client/reads';
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
 * Resolves an in-article card link (`/card/<slug-or-id>`) to the live card +
 * author, through the same visibility-enforced client read path as the card
 * page. Cards the viewer can't see (private / deleted) resolve to `error`,
 * letting callers fall back to a plain link.
 */
export function useCardEmbed(href: string): CardEmbedData {
  const [data, setData] = useState<CardEmbedData>({ status: 'loading' });

  useEffect(() => {
    const key = cardKeyFromHref(href);
    if (!key) {
      setData({ status: 'error' });
      return;
    }
    let alive = true;
    setData({ status: 'loading' });
    (async () => {
      const card = await getCardBySlugOrId(key);
      if (!card) {
        if (alive) setData({ status: 'error' });
        return;
      }
      const author = await getUserById(card.authorId).catch(() => null);
      if (alive) setData({ status: 'ready', card, author });
    })();
    return () => {
      alive = false;
    };
  }, [href]);

  return data;
}
