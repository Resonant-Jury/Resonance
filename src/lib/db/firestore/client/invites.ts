'use client';

import {
  collection,
  doc,
  getDoc,
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
import { getClientDb } from './init';

const DAILY_LIMIT = 3;
const EXPIRES_DAYS = 7;

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function sortedConnectionId(a: string, b: string): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

/**
 * Send an invite. Performs three writes inside a single transaction:
 *   1. Create /invites/{auto}
 *   2. Bump /quotas/{uid}_{today} counter (rules cap at 3)
 *   3. Create /notifications/{auto} for the recipient
 *
 * The sender must know their own handle to populate the notification payload
 * because notification rules cannot read other docs cheaply. Caller passes
 * `fromHandle` (already in scope on every page that knows the viewer).
 */
export async function sendInvite(input: {
  toUserId: string;
  message: string;
  referenceCardId?: string;
  fromHandle?: string;
}): Promise<string> {
  const uid = requireUid();
  const db = getClientDb();
  const quotaRef = doc(db, 'quotas', `${uid}_${todayKey()}`);

  const expiresAt = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);

  return runTransaction(db, async (tx) => {
    const quota = await tx.get(quotaRef);
    const used = quota.exists() ? Number(quota.data().inviteCount ?? 0) : 0;
    if (used >= DAILY_LIMIT) throw new Error('Daily invite quota exceeded');

    const inviteRef = doc(collection(db, 'invites'));
    tx.set(inviteRef, {
      fromUserId: uid,
      toUserId: input.toUserId,
      message: input.message,
      referenceCardId: input.referenceCardId ?? null,
      status: 'pending',
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp(),
    });
    tx.set(
      quotaRef,
      { userId: uid, day: todayKey(), inviteCount: used + 1 },
      { merge: true },
    );

    const notifRef = doc(collection(db, 'notifications'));
    tx.set(notifRef, {
      userId: input.toUserId,
      type: 'invite',
      payload: {
        inviteId: inviteRef.id,
        fromUserId: uid,
        fromHandle: input.fromHandle ?? '',
        referenceCardId: input.referenceCardId ?? null,
      },
      readAt: null,
      createdAt: serverTimestamp(),
    });

    return inviteRef.id;
  });
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
  // Denormalized into the notification payload — same reason as sendInvite:
  // notification rules cannot read other docs cheaply.
  const myHandle = await getCurrentUserHandle().catch(() => null);
  return runTransaction(db, async (tx) => {
    const inviteRef = doc(db, 'invites', inviteId);
    const snap = await tx.get(inviteRef);
    if (!snap.exists()) throw new Error('Invite not found');
    const data = snap.data();
    if (data.toUserId !== uid) throw new Error('Only the recipient can accept');
    if (data.status !== 'pending') throw new Error('Invite no longer pending');

    const otherUid = String(data.fromUserId);
    const connectionId = sortedConnectionId(uid, otherUid);
    const connectionRef = doc(db, 'connections', connectionId);

    tx.update(inviteRef, { status: 'accepted' });
    tx.set(connectionRef, {
      userIds: uid < otherUid ? [uid, otherUid] : [otherUid, uid],
      establishedAt: serverTimestamp(),
    });
    tx.set(doc(collection(db, 'notifications')), {
      userId: otherUid,
      type: 'invite_accepted',
      payload: { inviteId, fromUserId: uid, fromHandle: myHandle ?? '' },
      readAt: null,
      createdAt: serverTimestamp(),
    });

    return connectionId;
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

export async function listOutgoingInvites(): Promise<Invite[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'invites'),
      where('fromUserId', '==', uid),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapInvite(d.id, d.data()));
}

export async function remainingDailyQuota(): Promise<number> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return 0;
  const ref = doc(getClientDb(), 'quotas', `${uid}_${todayKey()}`);
  try {
    const snap = await getDoc(ref);
    const used = snap.exists() ? Number(snap.data().inviteCount ?? 0) : 0;
    return Math.max(0, DAILY_LIMIT - used);
  } catch {
    // The quota-read rule references `resource.data.userId`; for today's doc
    // before any invite is sent it doesn't exist, so `resource` is null and the
    // rule denies rather than returning an empty snapshot. No invites sent yet →
    // the full daily quota is still available.
    return DAILY_LIMIT;
  }
}
