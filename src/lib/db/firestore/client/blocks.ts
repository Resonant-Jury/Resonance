'use client';

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from './sdk';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { isConnected } from './reads';
import { getClientDb } from './init';

/**
 * Blocking (封鎖). The block list lives at `users/{uid}/blocks/{blockedUid}`
 * and is private to its owner; the blocked person is never told.
 *
 * What a block does:
 *  - Firestore rules refuse every way of reaching across it, both directions:
 *    connecting, messaging, invites, notes, notifications, card links
 *    (`blockedBetween()` in firestore.rules).
 *  - Blocking ends the connection and withdraws pending invites between the
 *    two people, so the existing conversation freezes.
 *  - The blocker stops seeing the other person's cards and conversations
 *    (filtered client-side through {@link getMyBlockedIds}).
 * Unblocking removes the entry only — a connection is never restored.
 */

export interface BlockedUser {
  uid: string;
  createdAt: Date | null;
}

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function blocksCol(uid: string) {
  return collection(getClientDb(), 'users', uid, 'blocks');
}

function connectionId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

// One in-flight read of the viewer's block list, shared by every feed/list
// fetcher; keyed by uid so switching accounts never reuses another's list.
let cache: { uid: string; ids: Promise<Set<string>> } | null = null;

/** The uids the signed-in viewer has blocked (empty when signed out). */
export function getMyBlockedIds(): Promise<Set<string>> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return Promise.resolve(new Set());
  if (cache?.uid !== uid) {
    const ids = getDocs(blocksCol(uid))
      .then((snap) => new Set(snap.docs.map((d) => d.id)))
      .catch(() => {
        cache = null; // don't pin a transient failure
        return new Set<string>();
      });
    cache = { uid, ids };
  }
  return cache.ids;
}

/** Forget the cached block list (after a block/unblock, or sign-out). */
export function invalidateBlocks(): void {
  cache = null;
}

export async function listMyBlocks(): Promise<BlockedUser[]> {
  const uid = requireUid();
  const snap = await getDocs(query(blocksCol(uid), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => {
    const at = d.data().createdAt;
    return { uid: d.id, createdAt: at instanceof Timestamp ? at.toDate() : null };
  });
}

/** Withdraw every pending invite between the viewer and `other`, either direction. */
async function withdrawPendingInvites(uid: string, other: string): Promise<void> {
  const invites = collection(getClientDb(), 'invites');
  const pairs: [string, string][] = [
    [uid, other],
    [other, uid],
  ];
  const snaps = await Promise.all(
    pairs.map(([from, to]) =>
      getDocs(
        query(
          invites,
          where('fromUserId', '==', from),
          where('toUserId', '==', to),
          where('status', '==', 'pending'),
        ),
      ),
    ),
  );
  await Promise.all(
    snaps.flatMap((s) => s.docs.map((d) => updateDoc(d.ref, { status: 'withdrawn' }))),
  );
}

export async function blockUser(otherUid: string): Promise<void> {
  const uid = requireUid();
  if (otherUid === uid) throw new Error('Cannot block yourself');
  // The block goes first: once it exists, rules already refuse any new
  // contact, so the cleanup below can't race a fresh connection.
  await setDoc(doc(blocksCol(uid), otherUid), {
    blockedUid: otherUid,
    createdAt: serverTimestamp(),
  });
  invalidateBlocks();
  if (await isConnected(uid, otherUid)) {
    await deleteDoc(doc(getClientDb(), 'connections', connectionId(uid, otherUid)));
  }
  await withdrawPendingInvites(uid, otherUid);
}

export async function unblockUser(otherUid: string): Promise<void> {
  const uid = requireUid();
  await deleteDoc(doc(blocksCol(uid), otherUid));
  invalidateBlocks();
}
