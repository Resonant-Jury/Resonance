import { FieldValue, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { cardPagePaths } from '@/lib/api/revalidate';
import { pairOf } from './conversations';
import { ApiFailure } from './http';
import { toFeedCard } from './present';
import { visibleCardById } from './reads';
import type { FeedCardBody } from './schemas';
import { properlyPublished } from './service';

/**
 * A resonance is a card answering another (`referenceCardId`). It is usually
 * written as one — the writer starts from the original, and publishing
 * connects the two authors (./publish) — but a card already written can
 * become one too: the reader picks one of their own published public cards,
 * and the server points it at the card they are reading. Everything that
 * lists resonances keys on that one field (the original's list, the card box's
 * resonated shelf, the thought map, the card's own "此文共振自"), so nothing
 * else is written for it.
 */

/** A batch or a transaction: whatever writes the original's side of a resonance. */
interface Writes {
  set(ref: DocumentReference, data: DocumentData): unknown;
}

export interface ResonanceReach {
  /** The resonator, and their pen name as the bell shows it. */
  from: string;
  fromHandle: string;
  original: { id: string; authorId: string; anonymous?: boolean };
  /** Whether the two are connected already (an existing connection is never written over: it carries `muted`, its date). */
  connected: boolean;
  /** The bell row to write on the original author's side; null when it has rung already. */
  bell: DocumentReference | null;
}

/**
 * The original author's side of a named resonance, once the caller has read
 * what this needs and checked that it may reach them (a card the resonator
 * can read, no block either way): the two are connected — unless the
 * original is anonymous (the connection would name its author to the
 * resonator) or they are already — and the original author's bell rings.
 * An anonymous resonance reaches no one, and never comes here: a connection
 * and a bell row both name the resonator. Publishing a written resonance and
 * resonating with a card already written both reach the original this way.
 */
export function reachOriginal(w: Writes, db: Firestore, r: ResonanceReach): void {
  const other = r.original.authorId;
  if (r.original.anonymous !== true && !r.connected) {
    w.set(db.doc(`connections/${pairOf(r.from, other)}`), {
      userIds: [r.from, other].sort(),
      establishedAt: FieldValue.serverTimestamp(),
    });
  }
  if (r.bell) {
    w.set(r.bell, {
      userId: other,
      type: 'resonance',
      payload: { fromUserId: r.from, fromHandle: r.fromHandle, cardId: r.original.id },
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

/**
 * The one bell row a reader's resonances with a card ring, whichever of
 * their cards answers it: picking a card, taking it back and picking it (or
 * another) again rings the original author once.
 */
export const resonanceBellId = (uid: string, targetId: string) => `resonance_${uid}_${targetId}`;

export interface Resonated {
  /** The chosen card as its author's card box shows it (their byline kept when anonymous), now answering the target. */
  card: FeedCardBody;
  /** False when it already answered the target: nothing was written, no one was rung. */
  changed: boolean;
  /** The original author's bell row, for its push (never returned to the client). */
  notificationId: string | null;
  /** The chosen card's pages, to revalidate after the response (their seed names the card it answers); empty when unchanged. */
  stale: string[];
}

const notFound = () => new ApiFailure('not_found', 'No such card.');

/**
 * Make one of your published public cards a resonance of `targetId` (POST
 * /cards/{targetId}/resonances): it now answers that card, as if it had been
 * written in response to it — the same reach as publishing one (./publish):
 * the authors connected (not across anonymity), the original author's bell
 * rung once. What firestore.rules would ask of a resonance written in the
 * browser is asked here: a card you can read that isn't yours, no block
 * either way.
 *
 * A card answers one card, and a reader answers a card with one of theirs
 * (the card page's 共振 / 修改 button stands on it): a card already
 * answering another, or a second card for the same original, is a conflict
 * — read in the transaction, so two taps racing can't both win. Only a
 * published public card qualifies: the original's list shows public cards
 * only, and a hidden resonance would still ring someone's phone. A card
 * answering yours can't be made to answer it back.
 *
 * The card's `updatedAt` is left alone: nothing a list shows of it changes
 * (bumping it would make lists read its story again, see ./summary).
 */
export async function resonateWith(db: Firestore, uid: string, targetId: string, cardId: string): Promise<Resonated> {
  const target = await visibleCardById(db, uid, targetId);
  if (!target.publishedAt) throw notFound();
  if (target.authorId === uid) throw new ApiFailure('invalid_request', 'You cannot resonate with your own card.');
  const other = target.authorId;
  const chosenRef = db.doc(`cards/${cardId}`);
  const bellRef = db.doc(`notifications/${resonanceBellId(uid, targetId)}`);
  // "One per reader": any card of theirs already answering the target (a draft too — the button says 修改 then).
  const answering = db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', targetId).limit(2);

  return db.runTransaction(async (tx) => {
    const [chosen, targetNow, blockOut, blockIn, me, connection, bell, answers] = await Promise.all([
      tx.get(chosenRef),
      tx.get(db.doc(`cards/${targetId}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`connections/${pairOf(uid, other)}`)),
      tx.get(bellRef),
      tx.get(answering),
    ]);
    // Someone else's card is as absent as a missing one.
    if (!chosen.exists || chosen.get('authorId') !== uid) throw notFound();
    if (!targetNow.exists) throw notFound();
    // An anonymous card by someone they blocked isn't there for them (as on its page, reads.ts getCardDetail).
    if (blockOut.exists && target.anonymous === true) throw notFound();
    // One answer for both directions: they must not learn which of them blocked whom.
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot resonate with this card.');
    if (!properlyPublished(chosen.get('publishedAt'))) throw new ApiFailure('invalid_request', 'Only a published card can resonate.');
    if (chosen.get('visibility') !== 'public') throw new ApiFailure('invalid_request', 'Only a public card can resonate.');

    const answered: DocumentData = { ...chosen.data()!, referenceCardId: targetId };
    const result = (changed: boolean, notificationId: string | null): Resonated => ({
      card: toFeedCard(mapCard(cardId, answered), me.data(), { deanonymize: true }),
      changed,
      notificationId,
      stale: changed ? cardPagePaths({ id: cardId, slug: typeof answered.slug === 'string' ? answered.slug : null }) : [],
    });

    const current = chosen.get('referenceCardId');
    if (current === targetId) return result(false, null);
    if (typeof current === 'string' && current) throw new ApiFailure('conflict', 'This card already resonates with another card.');
    if (answers.docs.some((d) => d.id !== cardId)) throw new ApiFailure('conflict', 'Another of your cards already resonates with this one.');
    if (targetNow.get('referenceCardId') === cardId) throw new ApiFailure('invalid_request', 'That card already resonates with this one.');

    tx.update(chosenRef, { referenceCardId: targetId });
    if (chosen.get('anonymous') === true) return result(true, null);
    const ring = !bell.exists;
    reachOriginal(tx, db, {
      from: uid,
      fromHandle: String(me.get('handle') ?? ''),
      original: { id: targetId, authorId: other, anonymous: target.anonymous === true },
      connected: connection.exists,
      bell: ring ? bellRef : null,
    });
    return result(true, ring ? bellRef.id : null);
  });
}

/**
 * Stop your card answering `targetId` (DELETE /cards/{targetId}/resonances/
 * {cardId}): it stays, as a card of its own. Written resonances too. The
 * connection and the bell row stay, as when a resonance is deleted. Asking
 * again changes nothing (`changed: false`); someone else's card is not_found.
 */
export async function unresonate(db: Firestore, uid: string, targetId: string, cardId: string): Promise<{ changed: boolean; stale: string[] }> {
  const ref = db.doc(`cards/${cardId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    if (snap.get('referenceCardId') !== targetId) return { changed: false, stale: [] };
    // Not `updatedAt` either: nothing a list shows of it changes.
    tx.update(ref, { referenceCardId: FieldValue.delete() });
    const slug = snap.get('slug');
    return { changed: true, stale: cardPagePaths({ id: cardId, slug: typeof slug === 'string' ? slug : null }) };
  });
}
