import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import { getVectorStore, type IVectorStore } from '@/lib/recommend/vectorStore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { ApiFailure } from './http';
import { toFeedCard } from './present';
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
}

/**
 * Change your card's visibility and/or anonymity (only the fields sent).
 * Someone else's card is as absent as a missing one. A pending edit
 * (edits/current) carries the same two fields: it takes the change too, or
 * applying it later would quietly undo it. The recommendation vectors keep
 * their own copy of the visibility (the candidate pool's filter): a new one
 * reaches them too, so a card made private or connections-only stops being
 * recommended to others — and one made public again rejoins the pool.
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
    if (changed) {
      tx.update(ref, { ...patch, updatedAt: FieldValue.serverTimestamp() });
      if (edit.exists) tx.update(editRef, patch);
    }
    return { before: snap.data()!, data: { ...snap.data()!, ...patch }, changed, author: me.data() };
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
  };
}

/**
 * Delete your card, draft or published — what the card box's delete does
 * from the client, plus what only the server can reach: its pending edit
 * (a subcollection the client's delete leaves behind) and its recommendation
 * vectors. Links and resonances pointing at it dangle, as they always have:
 * readers resolve a missing card to nothing. Answers the stale pages.
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
  await db.recursiveDelete(ref);
  // The card is gone either way; stray vectors only cost the recommender a candidate it then can't read.
  await Promise.resolve()
    .then(() => (vectors ?? getVectorStore()).deleteByCard(id))
    .catch((e) => console.error('[api/v1] vectors', id, e));
  return { stale: [...cardPagePaths(card), ...profilePagePaths(me.get('handle')), ...landingPagePaths(snap.data())] };
}
