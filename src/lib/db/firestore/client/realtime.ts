'use client';

import {
  collection,
  connectFirestoreEmulator,
  initializeFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  EMULATOR_FIRESTORE_PORT,
  USE_FIREBASE_EMULATOR,
  getFirebaseClientApp,
  getFirebaseClientAuth,
} from '@/lib/auth/firebase/client';

/*
 * The full Firestore SDK, for the one thing Lite can't do: listen. It is only
 * ever imported dynamically (messages.ts' listenThread), so it loads when a
 * thread opens, never with a page. Everything else reads and writes through
 * Lite (./init, ./sdk) — a separate instance of the same app.
 *
 * Its snapshots carry the full SDK's own Timestamp class, not Lite's: map
 * them with a check that accepts either (see messages.ts).
 */

let cached: Firestore | null = null;

function realtimeDb(): Firestore {
  if (cached) return cached;
  getFirebaseClientAuth(); // the listener signs in with the same user (see ./init)
  cached = initializeFirestore(getFirebaseClientApp(), { ignoreUndefinedProperties: true });
  if (USE_FIREBASE_EMULATOR) connectFirestoreEmulator(cached, '127.0.0.1', EMULATOR_FIRESTORE_PORT);
  return cached;
}

export interface ListenedDoc {
  id: string;
  data: DocumentData;
}

/**
 * Listen to the newest `max` documents of a collection by `field`, newest
 * first. Returns the unsubscribe function.
 */
export function listenNewest(
  path: [string, ...string[]],
  field: string,
  max: number,
  onDocs: (docs: ListenedDoc[]) => void,
  onError: (err: Error) => void,
): () => void {
  const [first, ...rest] = path;
  const q = query(collection(realtimeDb(), first, ...rest), orderBy(field, 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => onDocs(snap.docs.map((d) => ({ id: d.id, data: d.data() }))),
    (err) => onError(err),
  );
}
