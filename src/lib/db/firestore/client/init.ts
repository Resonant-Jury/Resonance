'use client';

import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { USE_FIREBASE_EMULATOR, getFirebaseClientApp } from '@/lib/auth/firebase/client';

let cached: Firestore | null = null;

export function getClientDb(): Firestore {
  if (cached) return cached;
  cached = initializeFirestore(getFirebaseClientApp(), {
    ignoreUndefinedProperties: true,
  });
  if (USE_FIREBASE_EMULATOR) connectFirestoreEmulator(cached, '127.0.0.1', 8080);
  return cached;
}
