'use client';

import {
  collection,
  doc,
  documentId,
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
 * never exposes their content. (The card page usually has the id already, from
 * its server render.)
 */
export async function getCardBySlugOrId(key: string): Promise<Card | null> {
  const id = await resolveCardId(key);
  return id ? getCardById(id) : null;
}

/**
 * A card URL segment → the document id it names (null: none). The server's
 * answer for a hit is CDN-cached (/api/cards/resolve). When the server can't
 * be reached, the segment itself is taken for a doc id.
 */
export async function resolveCardId(key: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/cards/resolve?key=${encodeURIComponent(key)}`);
    if (res.ok) return ((await res.json()) as { id: string | null }).id;
  } catch {
    // Network hiccup — fall through.
  }
  return key;
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

/**
 * Public cards that resonate with (reference) the given card, newest first.
 * Anonymous-readable: every match is `visibility == "public"`, so the Firestore
 * `list` rule allows signed-out viewers. Used for the card-detail resonance
 * section and the author-only resonator avatar group.
 */
export async function getResonanceCards(cardId: string, limit = 30): Promise<Card[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('referenceCardId', '==', cardId),
      where('visibility', '==', 'public'),
      where('publishedAt', '!=', null),
      orderBy('publishedAt', 'desc'),
      fbLimit(limit)
    )
  );
  return snap.docs.map((d) => mapCard(d.id, d.data()));
}

/**
 * The signed-in viewer's own resonance card for a given original (draft or
 * published), or null. Pure-equality query — no composite index needed. Drives
 * the「共振 / 修改」button and prefills the inline editor.
 */
export async function getMyResonanceCard(cardId: string): Promise<Card | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('authorId', '==', uid),
      where('referenceCardId', '==', cardId),
      fbLimit(1)
    )
  );
  const d = snap.docs[0];
  return d ? mapCard(d.id, d.data()) : null;
}

/** Author's cards filtered by box tab. Mirrors FirestoreCardRepository.findByAuthor. */
export async function getCardsByAuthor(authorId: string, tab: CardBoxTab): Promise<Card[]> {
  const db = getClientDb();

  if (tab === 'resonated') {
    // A "resonated" card now means an original I wrote a response card for: take
    // my own cards that reference another card, then resolve those originals.
    const mine = await getDocs(
      query(collection(db, 'cards'), where('authorId', '==', authorId), fbLimit(60))
    );
    const refIds = Array.from(
      new Set(
        mine.docs
          .map((d) => d.data().referenceCardId)
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
      )
    );
    const cards = await Promise.all(refIds.map((id) => getCardById(id)));
    return cards.filter((c): c is Card => Boolean(c));
  }

  // One query per shelf: with a shared "newest 40" query, an author's 41st
  // published card pushed every draft (publishedAt null sorts last) out of
  // the box, and private cards crowded out public ones.
  const own = [collection(db, 'cards'), where('authorId', '==', authorId)] as const;
  if (tab === 'draft') {
    const snap = await getDocs(query(...own, where('publishedAt', '==', null), fbLimit(DRAFT_SCAN)));
    // Most recently edited first (sorted here: drafts are few, and this needs no composite index).
    const edited = (d: (typeof snap.docs)[number]) => {
      const at = d.data().updatedAt;
      return at instanceof Timestamp ? at.toMillis() : 0;
    };
    return [...snap.docs]
      .sort((a, b) => edited(b) - edited(a))
      .slice(0, BOX_LIMIT)
      .map((d) => mapCard(d.id, d.data()));
  }
  const snap = await getDocs(
    query(
      ...own,
      where('visibility', 'in', tab === 'private' ? ['private'] : ['public', 'connections']),
      orderBy('publishedAt', 'desc'),
      fbLimit(BOX_LIMIT)
    )
  );
  return snap.docs.map((d) => mapCard(d.id, d.data())).filter((c) => c.publishedAt);
}

/** A card box shelf's size, and how many drafts are read to find the latest ones. */
const BOX_LIMIT = 40;
const DRAFT_SCAN = 200;

/**
 * Public cards for an author's outward-facing profile, newest first.
 *
 * Unlike {@link getCardsByAuthor}, this constrains the query to
 * `visibility == "public"` so it satisfies the Firestore `list` rule for
 * anonymous (signed-out) viewers — a logged-out visitor can read a blog-style
 * profile without tripping a permission error.
 *
 * Anonymous cards never surface here — the outward-facing profile is exactly
 * the place they must not be attributable (ux §6). They stay reachable via
 * their own card page and the feed, just without a byline.
 */
export async function getPublicCardsByAuthor(authorId: string): Promise<Card[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'cards'),
      where('authorId', '==', authorId),
      where('visibility', '==', 'public'),
      // The rules list public cards only once published — the query must say so.
      where('publishedAt', '!=', null),
      orderBy('publishedAt', 'desc'),
      fbLimit(40)
    )
  );
  return snap.docs
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => c.publishedAt && !c.anonymous);
}

/**
 * Whether the signed-in viewer has written any card at all (draft or
 * published). Drives the guided-first-card moments (ux §5): the write page's
 * question prompts and the feed's cold-start block.
 */
export async function hasAnyOwnCards(): Promise<boolean> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return false;
  const snap = await getDocs(
    query(collection(getClientDb(), 'cards'), where('authorId', '==', uid), fbLimit(1))
  );
  return !snap.empty;
}

// --- users ---

// Profiles are public (`users/*` allows get and list to anyone), and every
// list shows its cards' authors — the same few people over and over. So a
// page-wide cache keeps them for a few minutes, and the ones it lacks are read
// together, up to 30 per `documentId() in` query. (Cards are never read this
// way: one card the viewer can't see would make the rules refuse the whole
// query.)

/** How long a cached profile is trusted. */
const USER_TTL_MS = 5 * 60 * 1000;
/** Firestore's cap on an `in` filter's values. */
const IN_QUERY_MAX = 30;

const userCache = new Map<string, { user: User | null; at: number }>();
const userReads = new Map<string, Promise<User | null>>();

function cachedUser(id: string): User | null | undefined {
  const hit = userCache.get(id);
  if (!hit) return undefined;
  if (Date.now() - hit.at > USER_TTL_MS) {
    userCache.delete(id);
    return undefined;
  }
  return hit.user;
}

function remember(id: string, user: User | null): void {
  userCache.set(id, { user, at: Date.now() });
}

/** Drop a cached profile — after the viewer edits their own, say. No id clears them all. */
export function forgetCachedUser(id?: string): void {
  if (id === undefined) userCache.clear();
  else userCache.delete(id);
}

/** Read one chunk (≤ 30) of profiles in a single query and cache what came back — absent ones as null. */
function readUserChunk(ids: string[]): Promise<Map<string, User>> {
  const read = getDocs(query(collection(getClientDb(), 'users'), where(documentId(), 'in', ids))).then((snap) => {
    const found = new Map<string, User>();
    for (const d of snap.docs) found.set(d.id, mapUser(d.id, d.data()));
    for (const id of ids) remember(id, found.get(id) ?? null);
    return found;
  });
  for (const id of ids) {
    const one = read.then((found) => found.get(id) ?? null);
    userReads.set(id, one);
    void one.catch(() => undefined).finally(() => {
      if (userReads.get(id) === one) userReads.delete(id);
    });
  }
  return read;
}

/** A profile by uid, from the cache when it has it. */
export async function getUserById(id: string): Promise<User | null> {
  const hit = cachedUser(id);
  if (hit !== undefined) return hit;
  const pending = userReads.get(id);
  if (pending) return pending;
  const read = getDoc(doc(getClientDb(), 'users', id)).then((snap) => {
    const user = snap.exists() ? mapUser(snap.id, snap.data()) : null;
    remember(id, user);
    return user;
  });
  userReads.set(id, read);
  try {
    return await read;
  } finally {
    if (userReads.get(id) === read) userReads.delete(id);
  }
}

/** Profiles by uid, keyed by uid (missing ones left out): cached ones as they are, the rest in batched reads. */
export async function getUsersByIds(ids: string[]): Promise<Record<string, User>> {
  const unique = Array.from(new Set(ids)).filter((id) => id && !id.includes('/'));
  const out: Record<string, User> = {};
  const waits: Promise<unknown>[] = [];
  const missing: string[] = [];
  for (const id of unique) {
    const hit = cachedUser(id);
    if (hit !== undefined) {
      if (hit) out[id] = hit;
      continue;
    }
    const pending = userReads.get(id);
    if (pending) {
      waits.push(
        pending.then((u) => {
          if (u) out[id] = u;
        }),
      );
      continue;
    }
    missing.push(id);
  }
  for (let i = 0; i < missing.length; i += IN_QUERY_MAX) {
    waits.push(
      readUserChunk(missing.slice(i, i + IN_QUERY_MAX)).then((found) => {
        for (const [id, u] of found) out[id] = u;
      }),
    );
  }
  await Promise.all(waits);
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

/**
 * The signed-in viewer's own profile document, or null if not signed in / no
 * profile. Always read fresh (it's what the viewer just edited), and handed to
 * the cache for the lists that show them.
 */
export async function getCurrentUserProfile(): Promise<User | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(getClientDb(), 'users', uid));
  const user = snap.exists() ? mapUser(snap.id, snap.data()) : null;
  remember(uid, user);
  return user;
}

// --- connections ---

export async function isConnected(a: string, b: string): Promise<boolean> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'connections', connectionId(a, b)));
    return snap.exists();
  } catch {
    // The connection-read rule references `resource.data.userIds`; for a doc that
    // doesn't exist `resource` is null, so the rule denies rather than returning
    // an empty snapshot. Treat "denied/missing" as simply not connected.
    return false;
  }
}

/** The uids the signed-in viewer is connected with. */
export async function listMyConnectionUids(): Promise<string[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(collection(getClientDb(), 'connections'), where('userIds', 'array-contains', uid)),
  );
  return snap.docs
    .map((d) => (d.data().userIds as string[]).find((u) => u !== uid))
    .filter((u): u is string => Boolean(u));
}
