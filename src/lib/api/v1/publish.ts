import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { assignSlug } from '@/lib/ai/assignSlug';
import { mapCard } from '@/lib/db/firestore/mapper';
import { ApiFailure } from './http';
import { canView } from './present';

/** How long publishing waits for the slug (an LLM call) before answering without it. */
export const SLUG_WAIT_MS = 8_000;

export interface PublishResult {
  id: string;
  /** The English URL slug; null when generating it failed or is still under way (the card is live at its id). */
  slug: string | null;
  /** False when the card was already live — publishing again never re-dates it. */
  firstPublish: boolean;
  /** A resonance's bell row on the original author's side, for its push (never returned to the client). */
  notificationId: string | null;
  /** The slug still being made when the answer went out (never returned): the route awaits it after the response. */
  pendingSlug: Promise<string | null> | null;
}

const LATE = Symbol('late');

/** `p`'s value, or LATE when it takes longer than `ms` (p goes on). */
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof LATE> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Publish one of your own cards: what the web editor's submit() does from the
 * client, in one server call. Stamps publishedAt once (re-stamping would
 * re-date the card in every feed), gives it its slug, and — for a resonance,
 * the first time only — connects the two authors and rings the original
 * author's bell, re-checking what firestore.rules would: the original must be
 * visible to the resonator and no block may stand between them. Anonymous
 * resonances do neither: a connection names both uids.
 *
 * The slug and the resonance are made side by side. The slug is waited for
 * `slugWaitMs` at most: past that the answer says `slug: null` (the id is a
 * working URL) and the slug is written when it comes (`pendingSlug`).
 *
 * The recommendation index and the page cache are the route's (after the
 * response); `slugBase` is injectable so tests need no LLM.
 */
export async function publishCard(
  db: Firestore,
  uid: string,
  id: string,
  slugBase?: (title: string) => Promise<string>,
  opts: { slugWaitMs?: number } = {},
): Promise<PublishResult> {
  const ref = db.doc(`cards/${id}`);
  const card = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Someone else's card is as absent as a missing one.
    if (!snap.exists || snap.get('authorId') !== uid) throw new ApiFailure('not_found', 'No such card.');
    if (!String(snap.get('thoughtCore') ?? '').trim()) throw new ApiFailure('invalid_request', 'A card needs a title before it is published.');
    const firstPublish = snap.get('publishedAt') == null;
    tx.set(ref, {
      ...(firstPublish ? { publishedAt: FieldValue.serverTimestamp() } : {}),
      // Always a boolean once public: lists that may show a card to anyone
      // filter on `anonymous == false` (an absent field would drop it).
      anonymous: snap.get('anonymous') === true,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { data: snap.data()!, firstPublish };
  });

  // Publishing never waits long on — or fails for — the AI step; the id is a working URL.
  const slugP = assignSlug(db, id, slugBase).catch((e) => (console.error('[api/v1] slug', e), null));
  const referenceCardId = typeof card.data.referenceCardId === 'string' ? card.data.referenceCardId : null;
  const [slug, notificationId] = await Promise.all([
    within(slugP, opts.slugWaitMs ?? SLUG_WAIT_MS),
    card.firstPublish && referenceCardId && card.data.anonymous !== true
      ? connectResonance(db, uid, referenceCardId).catch((e) => (console.error('[api/v1] resonance', e), null))
      : null,
  ]);
  return {
    id,
    slug: slug === LATE ? null : slug,
    firstPublish: card.firstPublish,
    notificationId,
    pendingSlug: slug === LATE ? slugP : null,
  };
}

/**
 * Connect the two authors and ring the original's bell; the bell row's id, or
 * null when nothing rang. An anonymous original rings its author's bell but
 * connects no one: the resonator would find its author among their
 * connections (as a note to it connects no one either).
 */
async function connectResonance(db: Firestore, uid: string, originalId: string): Promise<string | null> {
  const snap = await db.doc(`cards/${originalId}`).get();
  if (!snap.exists) return null;
  const original = mapCard(snap.id, snap.data()!);
  const other = original.authorId;
  if (!other || other === uid || !(await canView(db, original, uid))) return null;
  const [out, inn, me] = await Promise.all([
    db.doc(`users/${uid}/blocks/${other}`).get(),
    db.doc(`users/${other}/blocks/${uid}`).get(),
    db.doc(`users/${uid}`).get(),
  ]);
  if (out.exists || inn.exists) return null;

  const pair = uid < other ? `${uid}_${other}` : `${other}_${uid}`;
  const connection = db.doc(`connections/${pair}`);
  const batch = db.batch();
  if (original.anonymous !== true && !(await connection.get()).exists) {
    batch.set(connection, { userIds: uid < other ? [uid, other] : [other, uid], establishedAt: FieldValue.serverTimestamp() });
  }
  const bell = db.collection('notifications').doc();
  batch.set(bell, {
    userId: other,
    type: 'resonance',
    payload: { fromUserId: uid, fromHandle: String(me.get('handle') ?? ''), cardId: originalId },
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return bell.id;
}
