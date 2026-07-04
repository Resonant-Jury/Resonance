'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
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

function bookmarkRef(uid: string, cardId: string) {
  return doc(getClientDb(), 'users', uid, 'bookmarks', cardId);
}

/**
 * Toggle a bookmark (收藏) — the purely private "speak to yourself" layer.
 * Doc id == card id so toggling is idempotent. Returns the new state.
 * Never counted, never notifies the author, never a recommendation signal.
 */
export async function toggleBookmark(cardId: string): Promise<boolean> {
  const uid = requireUid();
  const ref = bookmarkRef(uid, cardId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await deleteDoc(ref);
    return false;
  }
  await setDoc(ref, { cardId, createdAt: serverTimestamp() });
  return true;
}

export async function isBookmarked(cardId: string): Promise<boolean> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return false;
  const snap = await getDoc(bookmarkRef(uid, cardId));
  return snap.exists();
}

/** The viewer's bookmarked card ids, newest first. */
export async function listMyBookmarkIds(): Promise<string[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'users', uid, 'bookmarks'),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => d.id);
}
