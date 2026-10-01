'use client';

import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore/lite';
import {
  EMULATOR_FIRESTORE_PORT,
  USE_FIREBASE_EMULATOR,
  getFirebaseClientApp,
  getFirebaseClientAuth,
} from '@/lib/auth/firebase/client';

/*
 * The browser's reads and writes go through Firestore Lite: plain REST calls,
 * a fraction of the full SDK's size, with no listeners and no local cache —
 * neither of which they use (./sdk keeps the full SDK's write order and
 * read-your-writes). The one realtime surface, an open thread, loads the full
 * SDK on its own (./realtime, imported when a thread opens).
 */

let cached: Firestore | null = null;

export function getClientDb(): Firestore {
  if (cached) return cached;
  // Lite asks Auth for a token on every request, but only once Auth exists in
  // this app: a request sent before would go out signed out. Set Auth up
  // first (it's the same instance AuthProvider uses); each token then waits
  // for the signed-in user to be restored.
  getFirebaseClientAuth();
  cached = initializeFirestore(getFirebaseClientApp(), {
    ignoreUndefinedProperties: true,
  });
  if (USE_FIREBASE_EMULATOR) connectFirestoreEmulator(cached, '127.0.0.1', EMULATOR_FIRESTORE_PORT);
  return cached;
}
