'use client';

import {
  addDoc,
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
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

export async function sendInvite(input: {
  toUserId: string;
  message: string;
  referenceCardId?: string;
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
      { merge: true }
    );
    return inviteRef.id;
  });
}

export async function acceptInvite(inviteId: string): Promise<void> {
  requireUid();
  const db = getClientDb();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'invites', inviteId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Invite not found');
    tx.update(ref, { status: 'accepted' });
  });
}

export async function withdrawInvite(inviteId: string): Promise<void> {
  requireUid();
  await runTransaction(getClientDb(), async (tx) => {
    const ref = doc(getClientDb(), 'invites', inviteId);
    tx.update(ref, { status: 'withdrawn' });
  });
}

export async function remainingDailyQuota(): Promise<number> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return 0;
  const ref = doc(getClientDb(), 'quotas', `${uid}_${todayKey()}`);
  const { getDoc } = await import('firebase/firestore');
  const snap = await getDoc(ref);
  const used = snap.exists() ? Number(snap.data().inviteCount ?? 0) : 0;
  return Math.max(0, DAILY_LIMIT - used);
}

export async function sendInviteAndRequestRevalidate(input: {
  toUserId: string;
  message: string;
  referenceCardId?: string;
}): Promise<string> {
  return sendInvite(input);
}
