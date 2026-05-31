'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import type { Locale, User } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

export async function getCurrentUserHandle(): Promise<string | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(getClientDb(), 'users', uid));
  if (!snap.exists()) return null;
  const handle = snap.data().handle;
  return typeof handle === 'string' ? handle : null;
}

export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const handleLower = handle.trim().toLowerCase();
  if (!handleLower) return false;
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'users'),
      where('handleLower', '==', handleLower),
      limit(1)
    )
  );
  return snap.empty;
}

export async function updateProfile(patch: {
  handle?: string;
  bio?: string;
  region?: string;
  primaryLocale?: Locale;
  autoTranslateTo?: Locale[];
}): Promise<void> {
  const uid = requireUid();
  const ref = doc(getClientDb(), 'users', uid);
  const next: Record<string, unknown> = { ...patch };
  if (typeof patch.handle === 'string') {
    next.handleLower = patch.handle.trim().toLowerCase();
    next.handleChangedAt = serverTimestamp();
  }
  await setDoc(ref, next, { merge: true });
}

export async function createCurrentUserProfile(input: {
  handle: string;
  region: string;
  primaryLocale: Locale;
}): Promise<User> {
  const auth = getFirebaseClientAuth();
  const current = auth.currentUser;
  if (!current) throw new Error('Not signed in');

  const ref = doc(getClientDb(), 'users', current.uid);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    return { id: current.uid, ...(existing.data() as Omit<User, 'id'>) };
  }

  const avatarSeed = String(
    Math.abs([...current.uid].reduce((sum, ch) => sum + ch.charCodeAt(0), 0))
  );
  const profile = {
    handle: input.handle,
    handleLower: input.handle.toLowerCase(),
    bio: '',
    region: input.region,
    primaryLocale: input.primaryLocale,
    autoTranslateTo: input.primaryLocale === 'zh-TW' ? ['en'] : ['zh-TW'],
    verified: current.emailVerified,
    phoneHash: '',
    avatarSeed,
    initials: input.handle.slice(0, 2).toUpperCase(),
    accentColor: 'oklch(88% 0.08 55)',
    joinedAt: serverTimestamp(),
    handleChangedAt: serverTimestamp(),
  };
  await setDoc(ref, profile);
  return {
    id: current.uid,
    ...profile,
    autoTranslateTo: profile.autoTranslateTo as Locale[],
    joinedAt: new Date(),
    handleChangedAt: new Date(),
  };
}
