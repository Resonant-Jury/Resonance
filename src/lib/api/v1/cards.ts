import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ANONYMOUS_VISIBILITY_MESSAGE, anonymousForConnections, editedAudience } from '@/lib/db/firestore/cardContent';
import { mapCard } from '@/lib/db/firestore/mapper';
import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from './http';
import { readTakeBack, takeBack } from './origins';
import { toFeedCard } from './present';
import { becameReachable, hiddenResonance } from './resonate';
import { summaryFields } from './summary';
import type { FeedCardBody, UpdateCardInput } from './schemas';

/**
 * The card box's own changes to a card — its visibility, its byline, deleting
 * it — made by the server. The author can still do all three straight from
 * the client (the rules allow it for the builds that do) — but not to a
 * published resonance, whose take-back only the server runs — and only a
 * server path can drop the cached pages that showed the card as it was: each
 * answers the logical paths now stale (`stale`: the card, its author's
 * profile, the landing page when it could be listed there), which the route
 * revalidates after its response.
 */

const notFound = () => new ApiFailure('not_found', 'No such card.');

export interface UpdatedCard {
  /** The card as its author's card box shows it (their byline kept when anonymous). */
  card: FeedCardBody;
  /** Card, profile and landing pages to revalidate; empty when nothing changed. */
  stale: string[];
  /** The change made a published resonance reachable: the route reaches its original after the response (tryReachResonance). */
  reaches: boolean;
}

/**
 * Change your card's visibility and/or anonymity (only the fields sent).
 * Someone else's card is as absent as a missing one. An anonymous card is
 * public or private: a change that would leave it anonymous and for
 * connections only is refused (`invalid_request`, anonymousForConnections) —
 * one already that way changes nothing until either is sent. A pending edit
 * (edits/current) carries the same two fields: it takes the change too, or
 * applying it later would quietly undo it. The recommendation vectors keep
 * their own copy of the visibility (the candidate pool's filter): a new one
 * reaches them too, so a card made private or connections-only stops being
 * recommended to others — and one made public again rejoins the pool.
 *
 * A published resonance made public under its writer's name — published
 * private, connections-only or anonymous, it reached no one — now reaches the
 * original's author as publishing it so would have (`reaches`: the route
 * runs tryReachResonance after its response, so the answer never waits on
 * it): the two connected, their bell rung, once for each reader and card
 * whatever path rings it. The reach reads the card again, as it is then.
 * One made private, connections-only or anonymous no longer stands under its
 * original: it is taken back in the same transaction, as unresonate takes it
 * back (hiddenResonance, ./origins) — the connection goes with it when
 * nothing else holds it.
 */
export async function updateCard(
  db: Firestore,
  uid: string,
  id: string,
  input: UpdateCardInput,
  vectors?: Pick<IVectorStore, 'setVisibility'>,
): Promise<UpdatedCard> {
  const ref = db.doc(`cards/${id}`);
  const editRef = db.doc(`cards/${id}/edits/current`);
  const { before, data, changed, author } = await db.runTransaction(async (tx) => {
    const [snap, edit, me] = await Promise.all([tx.get(ref), tx.get(editRef), tx.get(db.doc(`users/${uid}`))]);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    const patch: Record<string, unknown> = {};
    if (input.visibility != null && input.visibility !== snap.get('visibility')) patch.visibility = input.visibility;
    if (input.anonymous != null && input.anonymous !== (snap.get('anonymous') === true)) patch.anonymous = input.anonymous;
    const changed = Object.keys(patch).length > 0;
    const after = { ...snap.data()!, ...patch };
    // Never into anonymous and for connections only; a card already that way keeps it until changed.
    if (changed && anonymousForConnections(after)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    // Read before anything is written: what hiding a published resonance takes back.
    const plans = changed && hiddenResonance(after) ? await readTakeBack(tx, db, uid, id) : [];
    takeBack(tx, plans);
    if (changed) {
      // A published card's story is as read here: its list summary is restated
      // with the new updatedAt (./summary). A draft gets one when it is published.
      const summary = snap.get('publishedAt') != null ? summaryFields(snap.get('story')) : {};
      tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp(), ...summary });
      // The pending edit takes the change — and the card's other half of it,
      // where the change alone would leave the edit anonymous and for
      // connections only (applying that would be refused).
      if (edit.exists) {
        const both = { visibility: after.visibility, anonymous: after.anonymous === true };
        tx.update(editRef, anonymousForConnections(editedAudience({ ...edit.data(), ...patch }, after)) ? both : patch);
      }
    }
    return { before: snap.data()!, data: after, changed, author: me.data() };
  });
  const card = mapCard(id, data);
  if (data.visibility !== before.visibility) {
    // The card has changed either way; the route answers it. A failure is
    // logged — the recommended feed still re-checks every card it shows.
    await Promise.resolve()
      .then(() => (vectors ?? getVectorStore()).setVisibility(id, card.visibility))
      .catch((e) => console.error('[api/v1] vectors', id, e));
  }
  return {
    card: toFeedCard(card, author, { deanonymize: true }),
    stale: changed ? [...cardPagePaths(card), ...profilePagePaths(author?.handle), ...landingPagePaths(before, data)] : [],
    reaches: changed && becameReachable(before, data),
  };
}

/**
 * Delete your card, draft or published — what the card box's delete does from
 * the client, plus what only the server can reach: its pending edit (a
 * subcollection the client's delete leaves behind), the notes left on it and
 * its recommendation vectors. Links and resonances pointing at it dangle, as
 * they always have: readers resolve a missing card to nothing. Answers the
 * stale pages.
 *
 * A resonance is taken back with it, as unresonate takes it back
 * (readTakeBack): read in the transaction that deletes the card, so a
 * resonance pointed at a card a moment before can't outlive it with its
 * connection. The notes go just after the card — once it is gone no note can
 * land on it — so they leave their writers' backups when the card's page goes,
 * never later with its author's account, which would say whose card it was.
 */
export async function deleteCard(
  db: Firestore,
  uid: string,
  id: string,
  vectors?: Pick<IVectorStore, 'deleteByCard'>,
): Promise<{ stale: string[] }> {
  const ref = db.doc(`cards/${id}`);
  const data = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
    takeBack(tx, await readTakeBack(tx, db, uid, id));
    tx.delete(ref);
    return snap.data()!;
  });
  // What is under the card (its pending edit).
  await db.recursiveDelete(ref);
  // The card is gone either way: stray notes go with its author's account, stray vectors only cost the recommender a candidate it then can't read.
  await deleteNotesOn(db, id).catch((e) => console.error('[api/v1] notes', id, e));
  await Promise.resolve()
    .then(() => (vectors ?? getVectorStore()).deleteByCard(id))
    .catch((e) => console.error('[api/v1] vectors', id, e));
  const me = await db.doc(`users/${uid}`).get();
  return { stale: [...cardPagePaths(mapCard(id, data)), ...profilePagePaths(me.get('handle')), ...landingPagePaths(data)] };
}

/** Every note left on the card `id`, delivered or withheld, a batch at a time. */
async function deleteNotesOn(db: Firestore, id: string): Promise<void> {
  const notes = db.collection('notes').where('cardId', '==', id).select().limit(BATCH_MAX);
  for (;;) {
    const page = await notes.get();
    if (page.empty) return;
    const batch = db.batch();
    page.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (page.size < BATCH_MAX) return;
  }
}

/** A batch's limit on writes. */
const BATCH_MAX = 500;
