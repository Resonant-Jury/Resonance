import { cache } from 'react';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { cardByKey } from '@/lib/db/firestore/cardKey';
import { mapCard, mapUser } from '@/lib/db/firestore/mapper';
import { toCardSeed, type CardSeed } from '@/lib/data/cardSeed';
import type { Card, User } from '@/lib/db/types';

/** A card page's server read. */
export interface LoadedCard {
  /** The document the URL segment names (any visibility), or null. */
  id: string | null;
  /** The card, only when a signed-out reader may read it (public and published). */
  card: Card | null;
  /** Its author's profile — never read for an anonymous card. */
  author: User | null;
}

/**
 * The card a URL segment names, as the world sees it. There is no viewer
 * here: the result becomes cached HTML served to everyone, so only what a
 * signed-out reader may read comes back — firestore.rules' `cardVisible` for
 * no one: published, and public — and what depends on the viewer (their
 * blocks, their own or connections-only cards) is left to the browser.
 */
export async function readCardForPage(db: Firestore, key: string): Promise<LoadedCard> {
  const snap = await cardByKey(db, key);
  if (!snap) return { id: null, card: null, author: null };
  const data = snap.data() ?? {};
  const card = mapCard(snap.id, data);
  if (card.visibility !== 'public' || data.publishedAt == null) return { id: snap.id, card: null, author: null };
  if (card.anonymous || !card.authorId || card.authorId.includes('/')) return { id: snap.id, card, author: null };
  const author = await db.doc(`users/${card.authorId}`).get();
  return { id: snap.id, card, author: author.exists ? mapUser(author.id, author.data() ?? {}) : null };
}

/**
 * {@link readCardForPage} once per render (React `cache`: the page's <head>
 * and its body share it). Null when the read failed: the page then resolves
 * the URL in the browser, as it did before the server read existed.
 */
export const loadCard = cache(async (key: string): Promise<LoadedCard | null> => {
  try {
    return await readCardForPage(getAdminDb(), key);
  } catch (e) {
    console.error('card page: server read failed', e);
    return null;
  }
});

/** What the card page hands the browser (see CardSeed), or null when the server couldn't tell. */
export async function loadCardSeed(key: string): Promise<CardSeed | null> {
  const loaded = await loadCard(key);
  return loaded && toCardSeed(loaded.id, loaded.card, loaded.author);
}
