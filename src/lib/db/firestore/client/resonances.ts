'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function resonanceId(cardId: string, userId: string): string {
  return `${cardId}_${userId}`;
}

export async function hasResonated(cardId: string): Promise<boolean> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(doc(getClientDb(), 'resonances', resonanceId(cardId, uid)));
  return snap.exists();
}

export interface ResonanceTarget {
  /** uid of the card's author, who should be notified. */
  authorId: string;
  /** The resonator's handle, embedded in the notification payload. */
  fromHandle: string;
}

/**
 * Mark a resonance. Writes the resonance record and — when we know the card's
 * author and the viewer isn't the author — a notification for the author, in a
 * single batch so the two land together (mirrors {@link sendInvite}).
 */
export async function markResonance(
  cardId: string,
  target?: ResonanceTarget,
  note?: string,
): Promise<void> {
  const uid = requireUid();
  const db = getClientDb();
  const batch = writeBatch(db);

  batch.set(doc(db, 'resonances', resonanceId(cardId, uid)), {
    cardId,
    userId: uid,
    note: note ?? null,
    createdAt: serverTimestamp(),
  });

  if (target && target.authorId !== uid) {
    batch.set(doc(collection(db, 'notifications')), {
      userId: target.authorId,
      type: 'resonance',
      payload: { fromUserId: uid, fromHandle: target.fromHandle, cardId },
      readAt: null,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
}

export async function unmarkResonance(cardId: string): Promise<void> {
  const uid = requireUid();
  await deleteDoc(doc(getClientDb(), 'resonances', resonanceId(cardId, uid)));
}

export async function toggleResonance(
  cardId: string,
  currentlyOn: boolean,
  target?: ResonanceTarget,
): Promise<void> {
  if (currentlyOn) await unmarkResonance(cardId);
  else await markResonance(cardId, target);
}

/**
 * The user ids that resonated with a card, newest first. Readable by the card's
 * author (and by each resonator for their own record). Used to render the
 * author-only resonator avatar group + modal.
 */
export async function listResonators(cardId: string, max = 50): Promise<string[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'resonances'),
      where('cardId', '==', cardId),
      orderBy('createdAt', 'desc'),
      fsLimit(max),
    ),
  );
  return snap.docs.map((d) => String(d.data().userId));
}
