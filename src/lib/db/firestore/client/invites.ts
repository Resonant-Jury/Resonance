'use client';

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import type { Invite } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getCurrentUserHandle } from './profile';
import { isConnected } from './reads';
import { getClientDb } from './init';
import { ringNotification } from './push';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function sortedConnectionId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Accept an invite. Performs three writes in a transaction:
 *   1. Flip the invite status to "accepted"
 *   2. Create the corresponding /connections/{sorted} doc
 *   3. Create a /notifications/{auto} "invite_accepted" for the inviter, so
 *      the sender learns the connection is live (closes the invite loop).
 *
 * Only the recipient (invite.toUserId) may accept.
 */
export async function acceptInvite(inviteId: string): Promise<string> {
  const uid = requireUid();
  const db = getClientDb();
  // Denormalized into the notification payload: notification rules cannot
  // read other docs cheaply.
  const myHandle = await getCurrentUserHandle().catch(() => null);
  const bell = doc(collection(db, 'notifications'));
  const connected = await runTransaction(db, async (tx) => {
    const inviteRef = doc(db, 'invites', inviteId);
    const snap = await tx.get(inviteRef);
    if (!snap.exists()) throw new Error('Invite not found');
    const data = snap.data();
    if (data.toUserId !== uid) throw new Error('Only the recipient can accept');
    if (data.status !== 'pending') throw new Error('Invite no longer pending');

    const otherUid = String(data.fromUserId);
    const connectionId = sortedConnectionId(uid, otherUid);
    const connectionRef = doc(db, 'connections', connectionId);

    // Already connected (a resonance or a note did it since): keep that connection
    // as it is — rewriting it would be an update, which the rules refuse. (Not a
    // transactional read: the rules deny reading a connection that doesn't exist.)
    const already = await isConnected(uid, otherUid);
    tx.update(inviteRef, { status: 'accepted' });
    if (!already) {
      tx.set(connectionRef, {
        userIds: uid < otherUid ? [uid, otherUid] : [otherUid, uid],
        establishedAt: serverTimestamp(),
      });
    }
    tx.set(bell, {
      userId: otherUid,
      type: 'invite_accepted',
      payload: { inviteId, fromUserId: uid, fromHandle: myHandle ?? '' },
      readAt: null,
      createdAt: serverTimestamp(),
    });

    return connectionId;
  });
  ringNotification(bell.id);
  return connected;
}

/** The recipient says no: the invite closes, no connection, no notification. */
export async function declineInvite(inviteId: string): Promise<void> {
  const uid = requireUid();
  const db = getClientDb();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'invites', inviteId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Invite not found');
    const data = snap.data();
    if (data.toUserId !== uid) throw new Error('Only the recipient can decline');
    if (data.status !== 'pending') throw new Error('Invite no longer pending');
    tx.update(ref, { status: 'declined' });
  });
}

export async function withdrawInvite(inviteId: string): Promise<void> {
  const uid = requireUid();
  const db = getClientDb();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'invites', inviteId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Invite not found');
    const data = snap.data();
    if (data.fromUserId !== uid) throw new Error('Only the sender can withdraw');
    tx.update(ref, { status: 'withdrawn' });
  });
}

function mapInvite(id: string, data: Record<string, unknown>): Invite {
  const expiresAt = data.expiresAt instanceof Timestamp ? data.expiresAt.toDate() : new Date(0);
  const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(0);
  return {
    id,
    fromUserId: String(data.fromUserId),
    toUserId: String(data.toUserId),
    message: String(data.message ?? ''),
    referenceCardId: (data.referenceCardId as string | null) ?? undefined,
    status: data.status as Invite['status'],
    expiresAt,
    createdAt,
  };
}

export async function listIncomingPendingInvites(): Promise<Invite[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'invites'),
      where('toUserId', '==', uid),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapInvite(d.id, d.data()));
}
