import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getAccountDeletion } from '@/lib/account/deletion';
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

/** The signed-in account, with its scheduled deletion if any (read beside the profile). */
export async function getMe(db: Firestore, uid: string): Promise<MeBody> {
  const [snap, deletion] = await Promise.all([db.doc(`users/${uid}`).get(), getAccountDeletion(db, uid)]);
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
    deletion: deletion
      ? { requestedAt: deletion.requestedAt.toISOString(), purgeAfter: deletion.purgeAfter.toISOString() }
      : null,
  };
}

/**
 * Whether a card's publishedAt is a real server stamp. The rules only let the
 * server set it now, but a card written before that could carry any value —
 * a string (which Firestore sorts above every timestamp) or a far-future
 * date — to sit on top of the feed; such a card is skipped, never fatal.
 */
export function properlyPublished(at: unknown, now = Date.now()): boolean {
  return at instanceof Timestamp && at.toMillis() <= now + 60 * 60 * 1000;
}

/**
 * Latest public cards, newest first — the web's latest-feed query, minus
 * authors the viewer blocked (`viewerId` null: a signed-out reader, who has
 * none). Anonymous cards come without their byline. Pages are cut on the
 * *raw* query so a page of blocked authors doesn't end the feed early.
 */
export async function getFeed(db: Firestore, viewerId: string | null, limit: number, cursor?: string): Promise<FeedPageBody> {
  let q = db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .limit(limit);
  if (cursor) q = q.startAfter(Timestamp.fromDate(new Date(cursor)));
  const [snap, blocked] = await Promise.all([q.get(), viewerId ? blockedByViewer(db, viewerId) : new Set<string>()]);

  const cards = snap.docs
    .filter((d) => properlyPublished(d.get('publishedAt')))
    .map((d) => mapCard(d.id, d.data()))
    .filter((c) => !blocked.has(c.authorId));
  const authors = await loadAuthors(db, cards);
  const lastAt = snap.docs.at(-1)?.get('publishedAt');
  return {
    cards: cards.map((c) => toFeedCard(c, authors.get(c.authorId))),
    nextCursor: snap.size === limit && lastAt instanceof Timestamp ? lastAt.toDate().toISOString() : null,
  };
}
