'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  orderBy,
  query,
  startAfter,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { Card, User } from '@/lib/db/types';
import type { CardBoxTab } from '@/lib/db/interfaces';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { mapCard, mapUser } from './map';

function connectionId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

// --- cards ---

/** Single card. Firestore rules enforce visibility; denied/missing → null. */
export async function getCardById(id: string): Promise<Card | null> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'cards', id));
    return snap.exists() ? mapCard(snap.id, snap.data()) : null;
  } catch {
    // permission-denied (not visible to this viewer) reads as "not found"
    return null;
  }
}

/**
 * Single card by URL segment, which may be a slug or a legacy doc id. We resolve
 * the segment → doc id on the server (admin, returns only the id), then read the
 * card through the visibility-enforced `get` rule via {@link getCardById}. This
 * keeps private cards gated by the same rule path as before — the slug index
 * never exposes their content.
 */
export async function getCardBySlugOrId(key: string): Promise<Card | null> {
  let id = key;
  try {
    const res = await fetch(`/api/cards/resolve?key=${encodeURIComponent(key)}`);
    if (res.ok) {
      const { id: resolved } = (await res.json()) as { id: string | null };
      if (!resolved) return null;
      id = resolved;
    }
  } catch {
    // Network hiccup — fall back to treating the segment as a doc id.
  }
  return getCardById(id);
}

/** Latest public, published cards. Mirrors FirestoreCardRepository.findLatestPublishedFeed. */
export async function getLatestPublishedFeed(limit = 12, cursor?: Date): Promise<Card[]> {
  const db = getClientDb();
  const constraints = [
    where('visibility', '==', 'public'),
    where('publishedAt', '!=', null),
    orderBy('publishedAt', 'desc'),
    fbLimit(limit),
  ];
  const q = cursor
    ? query(collection(db, 'cards'), ...constraints, startAfter(Timestamp.fromDate(cursor)))
    : query(collection(db, 'cards'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => mapCard(d.id, d.data()));
}

/** Cards sharing tags with the given card. Mirrors FirestoreCardRepository.findRelated. */
export async function getRelatedCards(cardId: string, limit = 3): Promise<Card[]> {
  const base = await getDoc(doc(getClientDb(), 'cards', cardId));
  const tags = ((base.data()?.tags ?? []) as string[]).slice(0, 5);
  const pool = await getLatestPublishedFeed(limit + 6);
  let cards = pool.filter((c) => c.id !== cardId);
  if (tags.length) {
    cards = cards.sort((a, b) => {
      const as = a.tags.filter((tag) => tags.includes(tag)).length;
      const bs = b.tags.filter((tag) => tags.includes(tag)).length;
      return bs - as;
    });
  }
  return cards.slice(0, limit);
}

/** Author's cards filtered by box tab. Mirrors FirestoreCardRepository.findByAuthor. */
export async function getCardsByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]> {
  const db = getClientDb();

  if (tab === 'resonated') {
    const resonances = await getDocs(
      query(
        collection(db, 'resonances'),
        where('userId', '==', authorId),
        orderBy('createdAt', 'desc'),
        fbLimit(30)
      )
    );
    const cards = await Promise.all(
      resonances.docs.map((r) => getCardById(String(r.data().cardId)))
    );
    return cards.filter((c): c is Card => Boolean(c));
  }

  const snap = await getDocs(
    query(
      collection(db, 'cards'),
      where('authorId', '==', authorId),
      orderBy('publishedAt', 'desc'),
      fbLimit(40)
    )
  );
  let cards = snap.docs.map((d) => mapCard(d.id, d.data()));
  if (tab === 'published') cards = cards.filter((c) => c.publishedAt && c.visibility !== 'private');
  if (tab === 'private') cards = cards.filter((c) => c.publishedAt && c.visibility === 'private');
  if (tab === 'draft') cards = cards.filter((c) => !c.publishedAt);
  return cards;
}

// --- users ---

export async function getUserById(id: string): Promise<User | null> {
  const snap = await getDoc(doc(getClientDb(), 'users', id));
  return snap.exists() ? mapUser(snap.id, snap.data()) : null;
}

export async function getUsersByIds(ids: string[]): Promise<Record<string, User>> {
  const unique = Array.from(new Set(ids));
  const list = await Promise.all(unique.map((id) => getUserById(id)));
  const out: Record<string, User> = {};
  for (const u of list) if (u) out[u.id] = u;
  return out;
}

export async function getUserByHandle(handle: string): Promise<User | null> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'users'),
      where('handleLower', '==', handle.trim().toLowerCase()),
      fbLimit(1)
    )
  );
  const d = snap.docs[0];
  return d ? mapUser(d.id, d.data()) : null;
}

/** The signed-in viewer's own profile document, or null if not signed in / no profile. */
export async function getCurrentUserProfile(): Promise<User | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  return getUserById(uid);
}

// --- connections ---

export async function isConnected(a: string, b: string): Promise<boolean> {
  const snap = await getDoc(doc(getClientDb(), 'connections', connectionId(a, b)));
  return snap.exists();
}
