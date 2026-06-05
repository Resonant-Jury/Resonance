'use client';

import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

export interface ResonanceTarget {
  /** uid of the original card's author, who should be notified. */
  authorId: string;
  /** The resonator's handle, embedded in the notification payload. */
  fromHandle: string;
}

/**
 * Notify the original card's author that someone published a card resonating
 * with theirs. A resonance is now a response card (a card whose
 * `referenceCardId` points at the original), so this only writes the
 * notification — the card itself is created via the normal card-publish path.
 * No-op when the resonator is the author.
 */
export async function notifyResonance(
  originalCardId: string,
  target: ResonanceTarget,
): Promise<void> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid || target.authorId === uid) return;
  const db = getClientDb();
  const batch = writeBatch(db);
  batch.set(doc(collection(db, 'notifications')), {
    userId: target.authorId,
    type: 'resonance',
    payload: { fromUserId: uid, fromHandle: target.fromHandle, cardId: originalCardId },
    readAt: null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
}
