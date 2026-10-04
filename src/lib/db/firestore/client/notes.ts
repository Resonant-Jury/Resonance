'use client';

import { collection, getDocs, orderBy, query, Timestamp, where } from './sdk';
import type { Note } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { callApi } from './api';

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
 * Send a private note (小紙條) to a card's author, through the server
 * (POST /api/v1/notes, the same call the apps make). The server finds the
 * author from the card, writes the note and the author's "note" bell (with
 * a short preview), and — on a named card — the note into the two people's
 * thread, where the author's answer is what connects them (a letter). It
 * also re-checks what the rules can't: that you can read the card, that it
 * isn't yours, and that no block stands between you. A refusal throws an
 * ApiError: `conflict` (409) when the writer has left as many notes as a
 * letter holds and waits for the author's answer.
 *
 * `clientId` (newClientId(), made once per send attempt and passed again on
 * every retry of the same text) makes the send retry-safe: a note whose
 * answer was lost is found, not left twice.
 */
export async function sendNote(input: { cardId: string; text: string; clientId?: string }): Promise<string> {
  requireUid();
  const text = input.text.trim();
  if (!text) throw new Error('Note is empty');
  if (text.length > NOTE_MAX_LENGTH) throw new Error('Note too long');
  const body = { cardId: input.cardId, text, ...(input.clientId ? { clientId: input.clientId } : {}) };
  const { id } = await callApi<{ id: string }>('/api/v1/notes', { method: 'POST', body });
  return id;
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
