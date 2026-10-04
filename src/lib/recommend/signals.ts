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
 * Only a resonance that reaches its original counts — published, public and
 * under the reader's name, as the original's list shows it: a draft or a
 * hidden one is nothing its author was ever shown, and would let a reader
 * point the boost at anyone they like to see what it lifts. And only a named
 * original: an anonymous card's author is no one's to know, and a boost would
 * point at them. Reads only the fields it needs (never the stories), the
 * originals in one batch.
 */
export async function getEngagedAuthorIds(uid: string, db: Firestore = getAdminDb()): Promise<Set<string>> {
  // The reader's own cards that reference another card = their resonances.
  const mine = await db
    .collection('cards')
    .where('authorId', '==', uid)
    .select('referenceCardId', 'publishedAt', 'visibility', 'anonymous')
    .limit(100)
    .get();
  const refIds = Array.from(
    new Set(
      mine.docs
        .filter((d) => d.get('publishedAt') != null && d.get('visibility') === 'public' && d.get('anonymous') !== true)
        .map((d) => d.get('referenceCardId'))
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && !id.includes('/'))
    )
  );
  if (refIds.length === 0) return new Set();

  const referenced = await db.getAll(...refIds.map((id) => db.collection('cards').doc(id)), { fieldMask: ['authorId', 'anonymous'] });
  const authors = new Set<string>();
  for (const snap of referenced) {
    const authorId = snap.get('authorId');
    // An anonymous original names no one: boosting its author's other cards
    // would show a reader who answered only it whose card it was.
    if (snap.get('anonymous') === true) continue;
    if (typeof authorId === 'string' && authorId !== uid) authors.add(authorId);
  }
  return authors;
}

/**
 * Which of these cards are under their author's name, read as they are now
 * (the anonymity field alone, one batch): only those may be lifted for being
 * by an author the reader answered — lifting an anonymous one would say who
 * wrote it. A card gone, or one that can't be read, is left out.
 */
export async function namedCardIds(cardIds: string[], db: Firestore = getAdminDb()): Promise<Set<string>> {
  const ids = [...new Set(cardIds.filter((id) => id.length > 0 && !id.includes('/')))];
  if (!ids.length) return new Set();
  const snaps = await db.getAll(...ids.map((id) => db.collection('cards').doc(id)), { fieldMask: ['anonymous'] });
  return new Set(snaps.filter((s) => s.exists && s.get('anonymous') !== true).map((s) => s.id));
}
