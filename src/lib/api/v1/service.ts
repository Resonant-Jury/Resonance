import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { ApiFailure } from './http';
import { blockedByViewer, loadAuthors, toFeedCard } from './present';
import type { FeedPageBody, MeBody } from './schemas';

/**
 * v1 business logic on the Admin SDK. The web client does these through
 * Firestore rules; here the server is the one enforcing them, so every rule
 * that guards the client path is checked explicitly (and tested against the
 * emulator in test/emulator/apiV1.emulator.test.ts).
 */

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

export async function getMe(db: Firestore, uid: string): Promise<MeBody> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) throw new ApiFailure('not_found', 'This account has no profile yet.');
  const u = snap.data()!;
  return {
    id: uid,
    handle: String(u.handle ?? ''),
    initials: String(u.initials ?? ''),
    accentColor: String(u.accentColor ?? ''),
    bio: str(u.bio),
    avatarUrl: str(u.avatarUrl),
    region: str(u.region),
    primaryLocale: u.primaryLocale === 'en' || u.primaryLocale === 'zh-TW' ? u.primaryLocale : null,
    handleChangedAt: u.handleChangedAt instanceof Timestamp ? u.handleChangedAt.toDate().toISOString() : null,
  };
}

/**
 * Latest public cards, newest first — the web's latest-feed query, minus
 * authors the viewer blocked. Pages are cut on the *raw* query so a page of
 * blocked authors doesn't end the feed early (same as useFeed on the web).
 */
export async function getFeed(db: Firestore, viewerId: string, limit: number, cursor?: string): Promise<FeedPageBody> {
  let q = db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(limit);
  if (cursor) q = q.startAfter(Timestamp.fromDate(new Date(cursor)));
  const [snap, blocked] = await Promise.all([q.get(), blockedByViewer(db, viewerId)]);

  const cards = snap.docs.map((d) => mapCard(d.id, d.data())).filter((c) => !blocked.has(c.authorId));
  const authors = await loadAuthors(db, cards);
  const last = snap.docs.at(-1);
  const lastAt = last?.get('publishedAt') as Timestamp | undefined;
  return {
    cards: cards.map((c) => toFeedCard(c, authors.get(c.authorId))),
    nextCursor: snap.size === limit && lastAt ? lastAt.toDate().toISOString() : null,
  };
}
