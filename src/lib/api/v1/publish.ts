import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { assignSlug } from '@/lib/ai/assignSlug';
import { ANONYMOUS_VISIBILITY_MESSAGE, anonymousForConnections } from '@/lib/db/firestore/cardContent';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { ApiFailure } from './http';
import { reachable, tryReachResonance } from './resonate';
import { summaryFields } from './summary';

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
 * the first time only — reaches the original's author (reachResonance: the
 * two connected, their bell rung once, in one transaction), re-checking what
 * firestore.rules would: the original must be visible to the resonator and no
 * block may stand between them. Only a resonance published public and under
 * its writer's name reaches anyone: a private or connections-only one is
 * never listed under the original, and an anonymous one would be named by
 * the connection. A resonator without a pen name reaches no one either; the
 * card is published all the same.
 *
 * An anonymous card is public or private: one set to be anonymous and for
 * connections only is refused (`invalid_request`, see
 * anonymousForConnections), and nothing is written.
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
  // Someone else's card is as absent as a missing one; so is an id Firestore keeps for itself.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const ref = db.doc(`cards/${id}`);
  const card = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Someone else's card is as absent as a missing one.
    if (!snap.exists || snap.get('authorId') !== uid) throw new ApiFailure('not_found', 'No such card.');
    if (!String(snap.get('thoughtCore') ?? '').trim()) throw new ApiFailure('invalid_request', 'A card needs a title before it is published.');
    const firstPublish = snap.get('publishedAt') == null;
    // Never newly published anonymous and for connections only (a card published so before is left as it is).
    if (firstPublish && anonymousForConnections(snap.data()!)) throw new ApiFailure('invalid_request', ANONYMOUS_VISIBILITY_MESSAGE);
    tx.set(
      ref,
      {
        ...(firstPublish ? { publishedAt: FieldValue.serverTimestamp() } : {}),
        // Always a boolean once public: lists that may show a card to anyone
        // filter on `anonymous == false` (an absent field would drop it).
        anonymous: snap.get('anonymous') === true,
        updatedAt: FieldValue.serverTimestamp(),
        // What lists show of it, so they needn't read its story (./summary).
        ...summaryFields(snap.get('story')),
      },
      { merge: true },
    );
    return { data: snap.data()!, firstPublish };
  });

  // Publishing never waits long on — or fails for — the AI step; the id is a working URL.
  const slugP = assignSlug(db, id, slugBase).catch((e) => (console.error('[api/v1] slug', e), null));
  const resonance = card.firstPublish && typeof card.data.referenceCardId === 'string' && reachable(card.data);
  const [slug, notificationId] = await Promise.all([
    within(slugP, opts.slugWaitMs ?? SLUG_WAIT_MS),
    // Best effort: a resonance that can't reach anyone is still published.
    resonance ? tryReachResonance(db, uid, id) : null,
  ]);
  return {
    id,
    slug: slug === LATE ? null : slug,
    firstPublish: card.firstPublish,
    notificationId,
    pendingSlug: slug === LATE ? slugP : null,
  };
}
