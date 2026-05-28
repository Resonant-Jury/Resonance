'use client';

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
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

export async function markResonance(cardId: string, note?: string): Promise<void> {
  const uid = requireUid();
  await setDoc(doc(getClientDb(), 'resonances', resonanceId(cardId, uid)), {
    cardId,
    userId: uid,
    note: note ?? null,
    createdAt: serverTimestamp(),
  });
}

export async function unmarkResonance(cardId: string): Promise<void> {
  const uid = requireUid();
  await deleteDoc(doc(getClientDb(), 'resonances', resonanceId(cardId, uid)));
}

export async function toggleResonance(cardId: string, currentlyOn: boolean): Promise<void> {
  if (currentlyOn) await unmarkResonance(cardId);
  else await markResonance(cardId);
}
