import { FieldValue, type DocumentData, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { Card } from '@/lib/db/types';
import { cardPagePaths } from '@/lib/api/revalidate';
import { hasPenName, noPenName, pairOf } from './conversations';
import { ApiFailure } from './http';
import { addReason, connect, originsRef, readTakeBack, resonanceReason, takeBack } from './origins';
import { cardVisible, toFeedCard } from './present';
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

/**
 * The one bell row a reader's resonances with a card ring, whichever of
 * their cards answers it and whichever path reaches it: picking a card,
 * taking it back and picking it (or another) again, publishing one, making
 * one public — the original author is rung once.
 */
export const resonanceBellId = (uid: string, targetId: string) => `resonance_${uid}_${targetId}`;

/** A document id that can be put in a path (a stored field could hold anything). */
const docId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && !v.includes('/');

/**
 * Whether a resonance may reach the original's author at all: only one shown
 * publicly under its writer's name. The original's list shows public cards
 * only, so a private or connections-only resonance is one its author could
 * never see — it must neither ring them nor connect the two — and an
 * anonymous one would name its writer in the connection and the bell.
 */
export function reachable(card: DocumentData | undefined): boolean {
  return card?.visibility === 'public' && card.anonymous !== true;
}

/**
 * Whether a change to a card (`before` → `after`, its stored fields) made a
 * published resonance reachable: public under its writer's name where it
 * wasn't. Such a card reaches the original then (reachResonance) — once: a
 * reader who already rang that card's author rings nothing again.
 */
export function becameReachable(before: DocumentData, after: DocumentData): boolean {
  return before.publishedAt != null && docId(after.referenceCardId) && !reachable(before) && reachable(after);
}

/**
 * Whether a card is a published resonance its original's list doesn't show
 * under its writer's name — private, connections-only or anonymous: whatever
 * reason it was for the two to be connected, it is no longer (a PATCH or an
 * applied edit that leaves it so takes it back, see ./origins).
 */
export function hiddenResonance(card: DocumentData): boolean {
  return card.publishedAt != null && docId(card.referenceCardId) && !reachable(card);
}

/** All a resonance's reach depends on, read in its transaction (readReach). */
export interface ReachReads {
  /** The resonator, and the card their resonance answers. */
  from: string;
  originalId: string;
  /** The original as it is now; null when it is gone. */
  original: Card | null;
  /** The resonator's profile: the bell carries their pen name. */
  me: DocumentSnapshot;
  blockOut: boolean;
  blockIn: boolean;
  connected: boolean;
  /** Why the two are connected (connectionOrigins, ./origins; null when there is no one to reach): the resonance becomes one more reason. */
  origins: DocumentSnapshot | null;
  /** This reader's one bell for that card (resonanceBellId), where it is written. */
  bell: DocumentSnapshot;
  /**
   * They have reached that card's author before: the bell above exists, or —
   * rung before it had a fixed id — a bell row of theirs for that card under
   * a random one (legacyBell).
   */
  rang: boolean;
}

/**
 * A resonance bell from before they had a fixed id (resonanceBellId): the old
 * publish path, and older still the browser, wrote `type: 'resonance'` rows
 * under random ids, with the same payload. Equality on four fields only, so
 * Firestore merges its single-field indexes: no composite index.
 *
 * For one day (2026-06-04/05, 5998ec4 → 90d9728) the browser also rang this
 * row for a "like" (markResonance, before a resonance became a card): the
 * same type, the same payload, its own random id — nothing in the row tells
 * the two apart. So a reader who liked a card that day and answers it now
 * counts as having rung its author already: no second ring, and no
 * connection made by it.
 */
const legacyBell = (db: Firestore, from: string, author: string, originalId: string) =>
  db.collection('notifications')
    .where('userId', '==', author)
    .where('type', '==', 'resonance')
    .where('payload.fromUserId', '==', from)
    .where('payload.cardId', '==', originalId)
    .limit(1);

/**
 * Read, in `tx` and before it writes anything, what a resonance from `from`
 * to the card `originalId` (a valid id) depends on: the original, the
 * resonator's profile and their bell for it, then — the author known — the
 * blocks both ways, the connection and its origins and, while the bell isn't
 * there, a legacy bell standing for it.
 */
export async function readReach(tx: Transaction, db: Firestore, from: string, originalId: string): Promise<ReachReads> {
  const [snap, me, bell] = await Promise.all([
    tx.get(db.doc(`cards/${originalId}`)),
    tx.get(db.doc(`users/${from}`)),
    tx.get(db.doc(`notifications/${resonanceBellId(from, originalId)}`)),
  ]);
  const original = snap.exists ? mapCard(snap.id, snap.data()!) : null;
  const none: ReachReads = {
    from, originalId, original, me, bell, rang: bell.exists, blockOut: false, blockIn: false, connected: false, origins: null,
  };
  const other = original?.authorId;
  if (!docId(other) || other === from) return none;
  const [out, inn, connection, origins, legacy] = await Promise.all([
    tx.get(db.doc(`users/${from}/blocks/${other}`)),
    tx.get(db.doc(`users/${other}/blocks/${from}`)),
    tx.get(db.doc(`connections/${pairOf(from, other)}`)),
    tx.get(originsRef(db, from, other)),
    bell.exists ? null : tx.get(legacyBell(db, from, other, originalId)),
  ]);
  return {
    ...none,
    rang: bell.exists || legacy?.empty === false,
    blockOut: out.exists,
    blockIn: inn.exists,
    connected: connection.exists,
    origins,
  };
}

/**
 * Reach the original's author, in the transaction that read `r` — `card` is
 * the resonance as that transaction leaves it. Every resonance path comes
 * here (publishing one, resonating with a card already written, making a
 * published one public and named), so all hold to the same:
 *
 * - the resonance is the resonator's, published, answers that original, and
 *   is public under their name (reachable);
 * - the original is there, someone else's, and theirs to read (cardVisible,
 *   with the connection read in this transaction);
 * - no block either way, and the resonator has a pen name (hasPenName).
 *
 * Such a resonance stands: on a named original it is a reason the two are
 * connected (connectionOrigins, ./origins) — it connects them when they
 * aren't, and when they are it is kept beside whatever else made them, so
 * taking another back leaves them connected while this one stands. It never
 * connects them across anonymity: an anonymous original would be named to the
 * resonator by the connection. An existing connection is never written over
 * (it carries `muted`, its date). A letter waiting between the two is left as
 * it is: only its recipient answers it (see sendNote).
 *
 * It rings the original's author once: the bell `resonance_{uid}_{originalId}`
 * is the record, written once — so a reader rings a card's author once
 * whichever path fires, and a connection a block ended (or a take-back) is
 * never made again without a ring. A bell rung before the record had a fixed
 * id counts too (ReachReads.rang). The bell of a resonance on an anonymous
 * card says so (`payload.anonymous`): it opens the card, never a thread with
 * the resonator, which their unread count would answer for. Answers the
 * bell's id, or null when nothing rang.
 */
export function reachOriginal(tx: Transaction, db: Firestore, cardId: string, card: DocumentData, r: ReachReads): string | null {
  const o = r.original;
  if (!reachable(card) || card.authorId !== r.from || card.referenceCardId !== r.originalId || !properlyPublished(card.publishedAt)) return null;
  if (!o || !docId(o.authorId) || o.authorId === r.from || !cardVisible(o, r.from, () => r.connected)) return null;
  if (r.blockOut || r.blockIn || !hasPenName(r.me)) return null;
  const named = o.anonymous !== true;
  if (named) {
    const reason = resonanceReason(r.from, cardId, r.originalId);
    if (r.connected) addReason(tx, db, [r.from, o.authorId], r.origins, reason);
    else if (!r.rang) connect(tx, db, [r.from, o.authorId], reason);
  }
  if (r.rang) return null;
  tx.set(r.bell.ref, {
    userId: o.authorId,
    type: 'resonance',
    payload: { fromUserId: r.from, fromHandle: String(r.me.get('handle')), cardId: r.originalId, ...(named ? {} : { anonymous: true }) },
    readAt: null,
    createdAt: FieldValue.serverTimestamp(),
  });
  return r.bell.id;
}

/**
 * Reach the original your card `cardId` answers (reachOriginal), in a
 * transaction of its own: what publishing a resonance, and making a published
 * one public and named, do once their own write is in. The card is read as it
 * is now, so one made private or anonymous in between reaches no one. Answers
 * the bell's id, or null.
 */
export async function reachResonance(db: Firestore, uid: string, cardId: string): Promise<string | null> {
  const ref = db.doc(`cards/${cardId}`);
  return db.runTransaction(async (tx) => {
    const card = (await tx.get(ref)).data();
    if (!card || card.authorId !== uid || !reachable(card) || !docId(card.referenceCardId)) return null;
    return reachOriginal(tx, db, cardId, card, await readReach(tx, db, uid, card.referenceCardId));
  });
}

/**
 * reachResonance as the paths around a card's own write take it: best effort
 * — a failure is logged and reaches no one, and the write it follows stands
 * (publishing, a PATCH, an applied edit never fail for it).
 */
export function tryReachResonance(db: Firestore, uid: string, cardId: string): Promise<string | null> {
  return reachResonance(db, uid, cardId).catch((e) => (console.error('[api/v1] resonance', cardId, e), null));
}

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
 * written in response to it — the same reach as publishing one, in the same
 * transaction as the pointing (reachOriginal): the authors connected (not
 * across anonymity), the original author's bell rung once. What
 * firestore.rules would ask of a resonance written in the browser is asked
 * here: a card you can read that isn't yours, no block either way — unless it
 * is anonymous, which a block never answers for (it reaches no one then). And
 * what reaching anyone asks: a pen name, when your card is public under it.
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
  const chosenRef = db.doc(`cards/${cardId}`);
  // "One per reader": any card of theirs already answering the target (a draft too — the button says 修改 then).
  const answering = db.collection('cards').where('authorId', '==', uid).where('referenceCardId', '==', targetId).limit(2);

  return db.runTransaction(async (tx) => {
    const [chosen, answers, reach] = await Promise.all([tx.get(chosenRef), tx.get(answering), readReach(tx, db, uid, targetId)]);
    const targetNow = reach.original;
    // Someone else's card is as absent as a missing one.
    if (!chosen.exists || chosen.get('authorId') !== uid) throw notFound();
    if (!targetNow || targetNow.authorId !== target.authorId || !cardVisible(targetNow, uid, () => reach.connected)) throw notFound();
    const answered: DocumentData = { ...chosen.data()!, referenceCardId: targetId };
    // A pen name for what reaches someone (a public card under their name
    // rings the original's author), asked before the blocks, as everywhere: an
    // anonymous card reaches no one and needs none.
    if (reachable(answered) && !hasPenName(reach.me)) throw noPenName();
    // A block refuses a named card — one answer for both directions: they must
    // not learn which of them blocked whom. Never an anonymous one: a refusal
    // would name its author. It is answered all the same, and reaches no one
    // (reachOriginal reads the blocks).
    if ((reach.blockOut || reach.blockIn) && targetNow.anonymous !== true) {
      throw new ApiFailure('blocked', 'You cannot resonate with this card.');
    }
    if (!properlyPublished(chosen.get('publishedAt'))) throw new ApiFailure('invalid_request', 'Only a published card can resonate.');
    if (chosen.get('visibility') !== 'public') throw new ApiFailure('invalid_request', 'Only a public card can resonate.');

    const result = (changed: boolean, notificationId: string | null): Resonated => ({
      card: toFeedCard(mapCard(cardId, answered), reach.me.data(), { deanonymize: true }),
      changed,
      notificationId,
      stale: changed ? cardPagePaths({ id: cardId, slug: typeof answered.slug === 'string' ? answered.slug : null }) : [],
    });

    const current = chosen.get('referenceCardId');
    if (current === targetId) return result(false, null);
    if (typeof current === 'string' && current) throw new ApiFailure('conflict', 'This card already resonates with another card.');
    if (answers.docs.some((d) => d.id !== cardId)) throw new ApiFailure('conflict', 'Another of your cards already resonates with this one.');
    if (targetNow.referenceCardId === cardId) throw new ApiFailure('invalid_request', 'That card already resonates with this one.');

    tx.update(chosenRef, { referenceCardId: targetId });
    // An anonymous card reaches no one (reachable): it still answers.
    return result(true, reachOriginal(tx, db, cardId, answered, reach));
  });
}

/**
 * Stop your card answering `targetId` (DELETE /cards/{targetId}/resonances/
 * {cardId}): it stays, as a card of its own. Written resonances too. It is no
 * longer a reason the two of you are connected (readTakeBack), and the
 * connection goes when nothing else holds it: no other resonance either way,
 * no answered letter, no invite, not made before reasons were kept — and the
 * original's author hasn't written to you since. The bell row stays:
 * answering that card again rings no one and connects no one (reachOriginal
 * rings a reader once per card). Asking again changes nothing (`changed:
 * false`); someone else's card is not_found.
 */
export async function unresonate(db: Firestore, uid: string, targetId: string, cardId: string): Promise<{ changed: boolean; stale: string[] }> {
  const ref = db.doc(`cards/${cardId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    if (snap.get('referenceCardId') !== targetId) return { changed: false, stale: [] };
    const plans = await readTakeBack(tx, db, uid, cardId);
    // Not `updatedAt` either: nothing a list shows of it changes.
    tx.update(ref, { referenceCardId: FieldValue.delete() });
    takeBack(tx, plans);
    const slug = snap.get('slug');
    return { changed: true, stale: cardPagePaths({ id: cardId, slug: typeof slug === 'string' ? slug : null }) };
  });
}
