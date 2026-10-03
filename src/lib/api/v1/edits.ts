import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { cardPagePaths, landingPagePaths, profilePagePaths } from '@/lib/api/revalidate';
import { cardContentProblem } from '@/lib/db/firestore/cardContent';
import { ApiFailure } from './http';
import { becameReachable } from './resonate';
import { summaryFields } from './summary';

export interface ApplyEditResult {
  id: string;
  /** Where the card lives: its English slug, or null (it is served at its id). */
  slug: string | null;
  /** False when there was no pending edit to apply (a retry after success lands here). */
  applied: boolean;
  /** The card, profile and landing pages the revision made stale, for the route to revalidate (never returned). */
  stale: string[];
  /** The revision made a published resonance reachable: the route reaches its original after the response (never returned). */
  reaches: boolean;
}

const VISIBILITIES = new Set(['public', 'connections', 'private']);

/**
 * Apply your pending edit to a published card, when an editor (web or app)
 * saves changes: the working copy in `cards/{id}/edits/current` (which the
 * editor autosaves, see client/cardEdits.ts) becomes the live fields and the
 * buffer is deleted, in one transaction, so a reader never sees half of a
 * revision. `publishedAt` is left alone (an edit never re-dates a card) and
 * so is the slug (a card keeps its URL).
 *
 * The buffer is written by the owner from the client, and one written before
 * the rules held it to a card's limits could hold anything: only the
 * editable fields are copied, each checked for its type, and an edit past
 * those limits (lib/db/firestore/cardContent) is refused. A cover missing
 * from the buffer was removed: it is deleted from the card too.
 * Applying twice is harmless — with no buffer left, nothing changes.
 *
 * The buffer carries the card's visibility and byline too: a resonance it
 * makes public under its writer's name reaches the original's author as a
 * PATCH doing so would (`reaches`, see updateCard).
 */
export async function applyCardEdit(db: Firestore, uid: string, id: string): Promise<ApplyEditResult> {
  const ref = db.doc(`cards/${id}`);
  const editRef = db.doc(`cards/${id}/edits/current`);
  return db.runTransaction(async (tx) => {
    const [snap, edit, me] = await Promise.all([tx.get(ref), tx.get(editRef), tx.get(db.doc(`users/${uid}`))]);
    // Someone else's card is as absent as a missing one.
    if (!snap.exists || snap.get('authorId') !== uid) throw new ApiFailure('not_found', 'No such card.');
    if (snap.get('publishedAt') == null) {
      throw new ApiFailure('invalid_request', 'A draft saves as you write; publish it instead.');
    }
    const slug = typeof snap.get('slug') === 'string' ? (snap.get('slug') as string) : null;
    if (!edit.exists) return { id, slug, applied: false, stale: [], reaches: false };

    const e = edit.data()!;
    const thoughtCore = typeof e.thoughtCore === 'string' ? e.thoughtCore : '';
    if (!thoughtCore.trim()) throw new ApiFailure('invalid_request', 'A card needs a title.');
    const story = typeof e.story === 'string' ? e.story : '';
    const content = {
      thoughtCore,
      story,
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
      accentHue: typeof e.accentHue === 'number' ? e.accentHue : null,
      media: isMedia(e.media) ? pickMedia(e.media) : null,
    };
    // The buffer may predate the rules' limits: the server copies nothing a client couldn't write.
    const problem = cardContentProblem(content, { keptMediaUrl: typeof snap.get('media.url') === 'string' ? snap.get('media.url') : null });
    if (problem) throw new ApiFailure('invalid_request', 'The edit does not fit a card.', [{ path: problem, message: 'Out of bounds.' }]);
    const fields: Record<string, unknown> = {
      ...content,
      // What lists show of the new story, so they needn't read it (./summary).
      ...summaryFields(story),
      visibility: VISIBILITIES.has(e.visibility) ? e.visibility : snap.get('visibility'),
      anonymous: e.anonymous === true,
      media: content.media ?? FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, fields, { merge: true });
    tx.delete(editRef);
    // Its page under both names, its author's profile (which lists it — unless
    // it just went private or anonymous), and the landing page if it was or is
    // public there.
    const stale = [
      ...cardPagePaths({ id, slug }),
      ...profilePagePaths(me.get('handle')),
      ...landingPagePaths(snap.data(), { visibility: fields.visibility, publishedAt: snap.get('publishedAt') }),
    ];
    const reaches = becameReachable(snap.data()!, { ...snap.data(), visibility: fields.visibility, anonymous: fields.anonymous });
    return { id, slug, applied: true, stale, reaches };
  });
}

function isMedia(m: unknown): m is { type: string; url: string; label?: unknown } {
  return !!m && typeof m === 'object' && typeof (m as { url?: unknown }).url === 'string' && typeof (m as { type?: unknown }).type === 'string';
}

/** A cover's own fields only (the buffer could hold anything beside them). */
function pickMedia(m: { type: string; url: string; label?: unknown }): { type: string; url: string; label?: string } {
  return { type: m.type, url: m.url, ...(typeof m.label === 'string' ? { label: m.label } : {}) };
}
