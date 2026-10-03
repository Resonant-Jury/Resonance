import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ANONYMOUS_VISIBILITY_MESSAGE, anonymousForConnections, editedAudience } from '@/lib/db/firestore/cardContent';
import { mapCard } from '@/lib/db/firestore/mapper';
import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from './http';
import { toFeedCard } from './present';
import { becameReachable, readTakeBack } from './resonate';
import { summaryFields } from './summary';
import type { FeedCardBody, UpdateCardInput } from './schemas';

/**
 * The card box's own changes to a card — its visibility, its byline, deleting
 * it — made by the server. The author can still do all three straight from
 * the client (the rules allow it for the builds that do), but only a server
 * path can drop the cached pages that showed the card as it was: each
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
 * Delete your card, draft or published — what the card box's delete does
 * from the client, plus what only the server can reach: its pending edit
 * (a subcollection the client's delete leaves behind) and its recommendation
 * vectors. Links and resonances pointing at it dangle, as they always have:
 * readers resolve a missing card to nothing. Answers the stale pages.
 *
 * A resonance takes back the connection it made, as taking it back without
 * deleting it does (unresonate): while the two have written each other
 * nothing, the connection goes in the same transaction as the card.
 */
export async function deleteCard(
  db: Firestore,
  uid: string,
  id: string,
  vectors?: Pick<IVectorStore, 'deleteByCard'>,
): Promise<{ stale: string[] }> {
  const ref = db.doc(`cards/${id}`);
  const [snap, me] = await Promise.all([ref.get(), db.doc(`users/${uid}`).get()]);
  if (!snap.exists || snap.get('authorId') !== uid) throw notFound();
  const card = mapCard(id, snap.data()!);
  const original = snap.get('referenceCardId');
  if (typeof original === 'string' && original) {
    await db.runTransaction(async (tx) => {
      const now = await tx.get(ref);
      if (!now.exists || now.get('authorId') !== uid) return;
      const connection = now.get('referenceCardId') === original ? await readTakeBack(tx, db, uid, id, original) : null;
      if (connection) tx.delete(connection);
      tx.delete(ref);
    });
  }
  // The card with what is under it (its pending edit), whether or not the above took the document first.
  await db.recursiveDelete(ref);
  // The card is gone either way; stray vectors only cost the recommender a candidate it then can't read.
  await Promise.resolve()
    .then(() => (vectors ?? getVectorStore()).deleteByCard(id))
    .catch((e) => console.error('[api/v1] vectors', id, e));
  return { stale: [...cardPagePaths(card), ...profilePagePaths(me.get('handle')), ...landingPagePaths(snap.data())] };
}
