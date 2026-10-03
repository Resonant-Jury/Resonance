'use client';

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  Timestamp,
  where,
} from './sdk';
import type { Invite } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { callApi } from './api';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/**
 * Accept an invite, through the server (POST /api/v1/invites/{id}/accept):
 * in one transaction it marks the invite accepted, connects
 * the two — keeping a connection a resonance or a note already made — and
 * rings the sender's "invite accepted" bell, which it also pushes. It
 * re-checks what the rules can't: that the invite is yours and still open,
 * and that no block stands between you. Answers the connection's id; a retry
 * after success answers it again and rings nothing.
 */
export async function acceptInvite(inviteId: string): Promise<string> {
  requireUid();
  const { connectionId } = await callApi<{ connectionId: string }>(
    `/api/v1/invites/${encodeURIComponent(inviteId)}/accept`,
    { method: 'POST' },
  );
  return connectionId;
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

/**
 * The invites still waiting for the signed-in viewer's answer, newest first:
 * pending and not yet past their "respond by" date. One past it the server
 * refuses (409) and closes as expired, but until someone taps Accept it is
 * still `pending` — so the date is checked here, on the invites the query
 * finds (a few at most: none are sent any more). One without a date was
 * never sent by a writer of ours, and is as closed as the server finds it.
 */
export async function listIncomingPendingInvites(now: Date = new Date()): Promise<Invite[]> {
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
  return snap.docs.map((d) => mapInvite(d.id, d.data())).filter((i) => i.expiresAt.getTime() > now.getTime());
}
