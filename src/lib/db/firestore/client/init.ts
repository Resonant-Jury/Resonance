'use client';

import { initializeFirestore, type Firestore } from 'firebase/firestore';
import { getFirebaseClientApp } from '@/lib/auth/firebase/client';

let cached: Firestore | null = null;

export function getClientDb(): Firestore {
  if (cached) return cached;
  cached = initializeFirestore(getFirebaseClientApp(), {
    ignoreUndefinedProperties: true,
  });
  return cached;
}
