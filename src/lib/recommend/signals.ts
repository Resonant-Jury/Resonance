import { getAdminDb } from '@/lib/db/firestore/admin';

/**
 * The chosen quality signal: authors whose cards this reader has *responded to*
 * by writing a resonance card (a card with `referenceCardId`). Unlike likes /
 * dwell-time (rejected by the Not-Doing List), authoring a response is a costly,
 * deliberate act — the strongest evidence of genuine resonance we have. We use
 * it as a light retrieval boost, and the data stays joinable for future offline
 * tuning.
 */
export async function getEngagedAuthorIds(uid: string): Promise<Set<string>> {
  const db = getAdminDb();
  // The reader's own cards that reference another card = their resonances.
  const mine = await db.collection('cards').where('authorId', '==', uid).limit(100).get();
  const refIds = Array.from(
    new Set(
      mine.docs
        .map((d) => d.data().referenceCardId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    )
  );
  if (refIds.length === 0) return new Set();

  const referenced = await Promise.all(refIds.map((id) => db.collection('cards').doc(id).get()));
  const authors = new Set<string>();
  for (const snap of referenced) {
    const authorId = snap.data()?.authorId;
    if (typeof authorId === 'string' && authorId !== uid) authors.add(authorId);
  }
  return authors;
}
