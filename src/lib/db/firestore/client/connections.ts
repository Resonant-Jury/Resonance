'use client';

import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { isConnected } from './reads';
import { getClientDb } from './init';

function sortedConnectionId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Make sure a connection exists between the signed-in user and `otherUid`,
 * creating it if missing. Reaching out with a story-shaped act (a resonance
 * card, a note) IS the connection — no invite/accept round-trip.
 *
 * The existence check matters: connection updates are rules-restricted to the
 * `muted` flag, so a blind merge-write onto an existing doc would be denied.
 * Two racers both passing the check is harmless — the create is
 * last-write-wins on identical data.
 */
export async function ensureConnection(otherUid: string): Promise<void> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid || uid === otherUid) return;
  if (await isConnected(uid, otherUid)) return;
  await setDoc(doc(getClientDb(), 'connections', sortedConnectionId(uid, otherUid)), {
    userIds: uid < otherUid ? [uid, otherUid] : [otherUid, uid],
    establishedAt: serverTimestamp(),
  });
}
