import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from './http';

export interface ApplyEditResult {
  id: string;
  /** Where the card lives: its English slug, or null (it is served at its id). */
  slug: string | null;
  /** False when there was no pending edit to apply (a retry after success lands here). */
  applied: boolean;
}

const VISIBILITIES = new Set(['public', 'connections', 'private']);

/**
 * Apply your pending edit to a published card: what the web editor's
 * applyPendingCardEdit() does from the client (cardEdits.ts), in one server
 * call — the working copy in `cards/{id}/edits/current` becomes the live
 * fields and the buffer is deleted, in one transaction, so a reader never sees
 * half of a revision. `publishedAt` is left alone (an edit never re-dates a
 * card) and so is the slug (a card keeps its URL).
 *
 * The buffer is written by the owner under rules that check ownership only,
 * so only the editable fields are copied, each checked for its type. A cover
 * missing from the buffer was removed: it is deleted from the card too.
 * Applying twice is harmless — with no buffer left, nothing changes.
 */
export async function applyCardEdit(db: Firestore, uid: string, id: string): Promise<ApplyEditResult> {
  const ref = db.doc(`cards/${id}`);
  const editRef = db.doc(`cards/${id}/edits/current`);
  return db.runTransaction(async (tx) => {
    const [snap, edit] = await Promise.all([tx.get(ref), tx.get(editRef)]);
    // Someone else's card is as absent as a missing one.
    if (!snap.exists || snap.get('authorId') !== uid) throw new ApiFailure('not_found', 'No such card.');
    if (snap.get('publishedAt') == null) {
      throw new ApiFailure('invalid_request', 'A draft saves as you write; publish it instead.');
    }
    const slug = typeof snap.get('slug') === 'string' ? (snap.get('slug') as string) : null;
    if (!edit.exists) return { id, slug, applied: false };

    const e = edit.data()!;
    const thoughtCore = typeof e.thoughtCore === 'string' ? e.thoughtCore : '';
    if (!thoughtCore.trim()) throw new ApiFailure('invalid_request', 'A card needs a title.');
    const fields: Record<string, unknown> = {
      thoughtCore,
      story: typeof e.story === 'string' ? e.story : '',
      tags: Array.isArray(e.tags) ? e.tags.filter((t): t is string => typeof t === 'string') : [],
      visibility: VISIBILITIES.has(e.visibility) ? e.visibility : snap.get('visibility'),
      anonymous: e.anonymous === true,
      accentHue: typeof e.accentHue === 'number' ? e.accentHue : null,
      media: isMedia(e.media) ? e.media : FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    tx.set(ref, fields, { merge: true });
    tx.delete(editRef);
    return { id, slug, applied: true };
  });
}

function isMedia(m: unknown): m is { type: string; url: string } {
  return !!m && typeof m === 'object' && typeof (m as { url?: unknown }).url === 'string' && typeof (m as { type?: unknown }).type === 'string';
}
