import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { ApiFailure } from './http';
import type { CreateInviteInput, FeedCardBody, FeedPageBody, MeBody } from './schemas';

/**
 * v1 business logic on the Admin SDK. The web client does these through
 * Firestore rules; here the server is the one enforcing them, so every rule
 * that guards the client path is checked explicitly (and tested against the
 * emulator in test/emulator/apiV1.emulator.test.ts).
 */

export const INVITE_DAILY_LIMIT = 3;
const INVITE_EXPIRES_DAYS = 7;
const EXCERPT_CHARS = 140;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length ? v : null;
}

/**
 * The first EXCERPT_CHARS characters, cut between code points: slicing UTF-16
 * units can leave half an emoji, a lone surrogate that Swift's JSONDecoder
 * rejects — failing the whole page.
 */
export function excerpt(story: string): string {
  const chars = Array.from(story);
  return chars.length > EXCERPT_CHARS ? `${chars.slice(0, EXCERPT_CHARS).join('')}…` : story;
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
  };
}

async function blockedByViewer(db: Firestore, uid: string): Promise<Set<string>> {
  const snap = await db.collection(`users/${uid}/blocks`).get();
  return new Set(snap.docs.map((d) => d.id));
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
  const authorIds = [...new Set(cards.filter((c) => !c.anonymous).map((c) => c.authorId))];
  const authors = new Map(
    (await Promise.all(authorIds.map((id) => db.doc(`users/${id}`).get())))
      .filter((s) => s.exists)
      .map((s) => [s.id, s.data()!]),
  );

  // Old or hand-edited documents may lack fields; one of them must not fail
  // the page (or the clients' strict decoders) for everyone.
  const body: FeedCardBody[] = cards.map((c) => {
    const a = c.anonymous ? undefined : authors.get(c.authorId);
    const published = c.publishedAt && !Number.isNaN(c.publishedAt.getTime()) ? c.publishedAt : new Date(0);
    return {
      id: c.id,
      slug: str(c.slug),
      title: String(c.thoughtCore ?? ''),
      excerpt: excerpt(String(c.story ?? '')),
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
      publishedAt: published.toISOString(),
      author: a
        ? { id: c.authorId, handle: String(a.handle ?? ''), initials: String(a.initials ?? ''), accentColor: String(a.accentColor ?? '') }
        : null,
    };
  });
  const last = snap.docs.at(-1);
  const lastAt = last?.get('publishedAt') as Timestamp | undefined;
  return { cards: body, nextCursor: snap.size === limit && lastAt ? lastAt.toDate().toISOString() : null };
}

/**
 * Send a connection invite: invite, daily quota and recipient notification in
 * one transaction, with the rules' guarantees checked server-side. The web no
 * longer sends invites (a resonance or a note forms the connection); this is
 * the S6 spike's write path, to be replaced by those acts in the app API.
 */
export async function createInvite(db: Firestore, fromUid: string, input: CreateInviteInput, now = new Date()): Promise<string> {
  const { toUserId } = input;
  if (toUserId === fromUid) throw new ApiFailure('invalid_request', 'You cannot invite yourself.');

  const pair = fromUid < toUserId ? `${fromUid}_${toUserId}` : `${toUserId}_${fromUid}`;
  const quotaRef = db.doc(`quotas/${fromUid}_${dayKey(now)}`);

  return db.runTransaction(async (tx) => {
    const [target, me, blockOut, blockIn, connection, pending, quota] = await Promise.all([
      tx.get(db.doc(`users/${toUserId}`)),
      tx.get(db.doc(`users/${fromUid}`)),
      tx.get(db.doc(`users/${fromUid}/blocks/${toUserId}`)),
      tx.get(db.doc(`users/${toUserId}/blocks/${fromUid}`)),
      tx.get(db.doc(`connections/${pair}`)),
      tx.get(
        db
          .collection('invites')
          .where('fromUserId', '==', fromUid)
          .where('toUserId', '==', toUserId)
          .where('status', '==', 'pending')
          .limit(1),
      ),
      tx.get(quotaRef),
    ]);
    if (!target.exists) throw new ApiFailure('not_found', 'No such user.');
    // One answer for both directions: the sender must not learn they were blocked.
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot invite this person.');
    if (connection.exists) throw new ApiFailure('conflict', 'You are already connected.');
    if (!pending.empty) throw new ApiFailure('conflict', 'An invite to this person is already waiting.');
    const used = Number(quota.get('inviteCount') ?? 0);
    if (used >= INVITE_DAILY_LIMIT) throw new ApiFailure('rate_limited', `At most ${INVITE_DAILY_LIMIT} invites a day.`);

    const inviteRef = db.collection('invites').doc();
    tx.set(inviteRef, {
      fromUserId: fromUid,
      toUserId,
      message: input.message,
      referenceCardId: input.referenceCardId ?? null,
      status: 'pending',
      expiresAt: Timestamp.fromDate(new Date(now.getTime() + INVITE_EXPIRES_DAYS * 86_400_000)),
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(quotaRef, { userId: fromUid, day: dayKey(now), inviteCount: used + 1 }, { merge: true });
    tx.set(db.collection('notifications').doc(), {
      userId: toUserId,
      type: 'invite',
      payload: {
        inviteId: inviteRef.id,
        fromUserId: fromUid,
        fromHandle: String(me.get('handle') ?? ''),
        referenceCardId: input.referenceCardId ?? null,
      },
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return inviteRef.id;
  });
}
