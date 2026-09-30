'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Conversation, Message } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { callApi } from './api';

/** Hard cap mirrored in the API's SendMessageRequest — keep the two in sync. */
export const MESSAGE_MAX_LENGTH = 2000;

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/** Sorted pair id — identical to the Connection doc id. */
export function conversationId(a: string, b: string): string {
  return [a, b].sort().join('_');
}

/** The other participant of a pair id, from the viewer's perspective. */
export function otherParticipant(pairId: string, uid: string): string {
  const [a, b] = pairId.split('_');
  return a === uid ? b : a;
}

function tsToDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function mapConversation(id: string, data: Record<string, unknown>): Conversation {
  const last = data.lastMessage as Record<string, unknown> | null | undefined;
  return {
    id,
    participants: (data.participants as [string, string]) ?? ['', ''],
    createdAt: tsToDate(data.createdAt) ?? new Date(0),
    updatedAt: tsToDate(data.updatedAt) ?? new Date(0),
    lastMessage: last
      ? {
          text: String(last.text ?? ''),
          senderId: String(last.senderId ?? ''),
          sentAt: tsToDate(last.sentAt) ?? new Date(0),
        }
      : null,
    unread: (data.unread as Record<string, number>) ?? {},
    originCardId: data.originCardId ? String(data.originCardId) : undefined,
  };
}

function mapMessage(id: string, data: Record<string, unknown>): Message {
  return {
    id,
    senderId: String(data.senderId ?? ''),
    text: String(data.text ?? ''),
    // serverTimestamp resolves as null in the local latency-compensated
    // snapshot — surface "now" so an optimistic message sorts last.
    sentAt: tsToDate(data.sentAt) ?? new Date(),
    cardRef: data.cardRef ? String(data.cardRef) : undefined,
    noteRef: data.noteRef as Message['noteRef'],
  };
}

export interface MessageExtras {
  /** A shared card (renders as an EmbedStoryCard in the thread). */
  cardRef?: string;
  /** The 紙條 this message replies to (quote header in the thread). */
  noteRef?: { cardId: string; noteId: string };
}

/**
 * Send a message to someone you're connected with, through the server
 * (POST /api/v1/messages — the call the apps make). One transaction opens the
 * conversation on the first message, writes the message, the list preview (a
 * bodyless card share borrows the card's title) and the recipient's unread
 * counter, and rings their bell for the first message only; it re-checks the
 * connection, blocks, and that an attached card is one you can read. The
 * rules refuse all of this from the browser. Text is optional only when a
 * card is attached.
 */
export async function sendMessage(
  toUserId: string,
  text: string,
  extras: MessageExtras = {},
): Promise<{ conversationId: string; id: string }> {
  requireUid();
  const trimmed = text.trim();
  if (!trimmed && !extras.cardRef) throw new Error('Message is empty');
  if (trimmed.length > MESSAGE_MAX_LENGTH) throw new Error('Message too long');
  return callApi('/api/v1/messages', {
    method: 'POST',
    body: { to: toUserId, text: trimmed, cardRef: extras.cardRef ?? null, noteRef: extras.noteRef ?? null },
  });
}

/** Zero the viewer's own unread counter on a conversation. */
export async function markConversationRead(pairId: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getClientDb(), 'conversations', pairId), {
    [`unread.${uid}`]: 0,
  });
}

/** The viewer's conversations, most recently active first. */
export async function listConversations(): Promise<Conversation[]> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'conversations'),
      where('participants', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => mapConversation(d.id, d.data()));
}

/** A single conversation, or null when missing / not a participant. */
export async function getConversation(pairId: string): Promise<Conversation | null> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'conversations', pairId));
    return snap.exists() ? mapConversation(snap.id, snap.data()) : null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to the newest messages of an open thread (oldest → newest, capped
 * at `max`). This is the project's only realtime surface — deliberately scoped
 * to the one thread the viewer is looking at; lists and badges stay on SWR.
 * Returns the unsubscribe function.
 */
export function listenThread(
  pairId: string,
  onMessages: (messages: Message[]) => void,
  onError?: (err: Error) => void,
  max = 50,
): () => void {
  const q = query(
    collection(getClientDb(), 'conversations', pairId, 'messages'),
    orderBy('sentAt', 'desc'),
    fbLimit(max),
  );
  return onSnapshot(
    q,
    (snap) => {
      const msgs = snap.docs.map((d) => mapMessage(d.id, d.data()));
      msgs.reverse();
      onMessages(msgs);
    },
    (err) => onError?.(err),
  );
}

/**
 * Delete a conversation and its messages, for both participants. Firestore
 * doesn't cascade subcollection deletes, so the messages go first (in batched
 * chunks under the 500-write limit) and the parent doc last — a crash midway
 * leaves a still-listable conversation rather than orphaned messages.
 */
export async function deleteConversation(pairId: string): Promise<void> {
  requireUid();
  const db = getClientDb();
  const msgs = await getDocs(collection(db, 'conversations', pairId, 'messages'));
  for (let i = 0; i < msgs.docs.length; i += 450) {
    const batch = writeBatch(db);
    for (const d of msgs.docs.slice(i, i + 450)) batch.delete(d.ref);
    await batch.commit();
  }
  const batch = writeBatch(db);
  batch.delete(doc(db, 'conversations', pairId));
  await batch.commit();
}

/** Total unread across all conversations — drives the header badge. */
export async function countUnreadMessages(): Promise<number> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return 0;
  const conversations = await listConversations();
  return conversations.reduce((sum, c) => sum + (c.unread[uid] ?? 0), 0);
}
