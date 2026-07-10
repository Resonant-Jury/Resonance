'use client';

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Note } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { ensureConnection } from './connections';
import { getClientDb } from './init';

/** Hard cap mirrored in firestore.rules — keep the two in sync. */
export const NOTE_MAX_LENGTH = 2000;

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

function tsToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function mapNote(id: string, data: Record<string, unknown>): Note {
  return {
    id,
    cardId: String(data.cardId ?? ''),
    fromUserId: String(data.fromUserId),
    toUserId: String(data.toUserId),
    text: String(data.text ?? ''),
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
    readAt: tsToDate(data.readAt),
  };
}

/**
 * Send a private note (小紙條) to a card's author. Two writes in one batch:
 * the note itself and a "note" notification for the recipient (with a short
 * preview denormalized into the payload so the bell can render it without a
 * second read). No audience, no counts — the author is the only reader.
 *
 * Reaching out with a note also establishes the connection right away, so the
 * exchange can continue in 私訊 without an invite round-trip.
 */
export async function sendNote(input: {
  cardId: string;
  toUserId: string;
  text: string;
  /** The sender's handle, denormalized into the notification payload. */
  fromHandle: string;
}): Promise<string> {
  const uid = requireUid();
  const text = input.text.trim();
  if (!text) throw new Error('Note is empty');
  if (text.length > NOTE_MAX_LENGTH) throw new Error('Note too long');
  if (input.toUserId === uid) throw new Error('Cannot send a note to yourself');

  const db = getClientDb();
  const batch = writeBatch(db);
  const noteRef = doc(collection(db, 'notes'));
  batch.set(noteRef, {
    cardId: input.cardId,
    fromUserId: uid,
    toUserId: input.toUserId,
    text,
    readAt: null,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(collection(db, 'notifications')), {
    userId: input.toUserId,
    type: 'note',
    payload: {
      noteId: noteRef.id,
      cardId: input.cardId,
      fromUserId: uid,
      fromHandle: input.fromHandle,
      preview: text.slice(0, 140),
    },
    readAt: null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  // Best-effort: the note must never fail because the connection write did.
  await ensureConnection(input.toUserId).catch(() => {});
  return noteRef.id;
}

/** Notes the signed-in viewer has received, newest first. */
export async function listReceivedNotes(): Promise<Note[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'notes'),
      where('toUserId', '==', uid),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapNote(d.id, d.data()));
}
