'use client';

import { addDoc, collection, serverTimestamp } from './sdk';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

/**
 * Reports (檢舉) — App Store guideline 1.2 requires a way to flag
 * objectionable content and abusive users. Reports are write-only for clients
 * (firestore.rules); moderation reads them with the Admin SDK
 * (`npm run moderation -- list`).
 */
export type ReportTargetType = 'card' | 'user' | 'message';

export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'self_harm',
  'violence',
  'other',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Mirrors the cap in firestore.rules — keep the two in sync. */
export const REPORT_DETAIL_MAX = 1000;

export interface ReportInput {
  targetType: ReportTargetType;
  /** Card id, user id, or message id. */
  targetId: string;
  /** The person responsible for the content (the card's author, the sender…). */
  targetUserId: string;
  reason: ReportReason;
  detail?: string;
  /** Where it happened, e.g. the conversation id for a message. */
  contextId?: string;
}

export async function submitReport(input: ReportInput): Promise<void> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  const detail = (input.detail ?? '').trim().slice(0, REPORT_DETAIL_MAX);
  await addDoc(collection(getClientDb(), 'reports'), {
    reporterId: uid,
    targetType: input.targetType,
    targetId: input.targetId,
    targetUserId: input.targetUserId,
    reason: input.reason,
    detail,
    ...(input.contextId ? { contextId: input.contextId } : {}),
    createdAt: serverTimestamp(),
    status: 'open',
  });
}
