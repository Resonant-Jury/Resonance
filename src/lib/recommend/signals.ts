import type { Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/db/firestore/admin';

/**
 * The chosen quality signal: authors whose cards this reader has *responded to*
 * by writing a resonance card (a card with `referenceCardId`). Unlike likes /
 * dwell-time (rejected by the Not-Doing List), authoring a response is a costly,
 * deliberate act — the strongest evidence of genuine resonance we have. We use
 * it as a light retrieval boost, and the data stays joinable for future offline
 * tuning.
 *
 * Reads only the two fields it needs (never the stories), the originals in
 * one batch.
 */
export async function getEngagedAuthorIds(uid: string, db: Firestore = getAdminDb()): Promise<Set<string>> {
  // The reader's own cards that reference another card = their resonances.
  const mine = await db.collection('cards').where('authorId', '==', uid).select('referenceCardId').limit(100).get();
  const refIds = Array.from(
    new Set(
      mine.docs
        .map((d) => d.get('referenceCardId'))
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/'))
    )
  );
  if (refIds.length === 0) return new Set();

  const referenced = await db.getAll(...refIds.map((id) => db.collection('cards').doc(id)), { fieldMask: ['authorId'] });
  const authors = new Set<string>();
  for (const snap of referenced) {
    const authorId = snap.get('authorId');
    if (typeof authorId === 'string' && authorId !== uid) authors.add(authorId);
  }
  return authors;
}
