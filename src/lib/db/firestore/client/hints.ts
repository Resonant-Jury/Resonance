'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

/**
 * Best-effort sync of a hint's seen-count to the signed-in user's doc
 * (`hintsSeen` map), so dismissed hints stay quiet across devices. Failures
 * are swallowed — localStorage remains the source of truth on this device.
 */
export async function syncHintCount(key: string, count: number): Promise<void> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(getClientDb(), 'users', uid), {
      [`hintsSeen.${key}`]: count,
    });
  } catch {
    // offline / rules hiccup — the local count still governs this device
  }
}
