'use client';

import { getFirestore, type Firestore } from 'firebase/firestore';
import { getFirebaseClientApp } from '@/lib/auth/firebase/client';

let cached: Firestore | null = null;

export function getClientDb(): Firestore {
  if (cached) return cached;
  cached = getFirestore(getFirebaseClientApp());
  return cached;
}
