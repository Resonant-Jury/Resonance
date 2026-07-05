'use client';

import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit as fbLimit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { Conversation, Message } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';

/** Hard cap mirrored in firestore.rules — keep the two in sync. */
export const MESSAGE_MAX_LENGTH = 2000;

/** How much of the last message the conversation list preview keeps. */
const LAST_MESSAGE_PREVIEW = 120;

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

/**
 * Open (idempotently create) the conversation with a connected user and return
 * its id. Rules verify the corresponding connection doc exists, so calling
 * this against a stranger fails with permission-denied.
 */
export async function openConversation(otherUid: string, originCardId?: string): Promise<string> {
  const uid = requireUid();
  if (otherUid === uid) throw new Error('Cannot message yourself');
  const id = conversationId(uid, otherUid);
  const db = getClientDb();
  const ref = doc(db, 'conversations', id);
  // Reading a *nonexistent* conversation is denied (the read rule dereferences
  // resource.data), not returned as missing — treat denial as "not created yet"
  // and let the create rule be the arbiter.
  let exists = false;
  try {
    exists = (await getDoc(ref)).exists();
  } catch {
    exists = false;
  }
  if (exists) return id;
  const participants = [uid, otherUid].sort();
  await setDoc(ref, {
    participants,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessage: null,
    unread: { [participants[0]]: 0, [participants[1]]: 0 },
    ...(originCardId ? { originCardId } : {}),
  });
  return id;
}

/**
 * Send a message: one batch writes the message doc and updates the parent's
 * denormalized preview + the recipient's unread counter.
 */
export async function sendMessage(pairId: string, text: string): Promise<string> {
  const uid = requireUid();
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Message is empty');
  if (trimmed.length > MESSAGE_MAX_LENGTH) throw new Error('Message too long');

  const db = getClientDb();
  const batch = writeBatch(db);
  const msgRef = doc(collection(db, 'conversations', pairId, 'messages'));
  batch.set(msgRef, {
    senderId: uid,
    text: trimmed,
    sentAt: serverTimestamp(),
  });
  batch.update(doc(db, 'conversations', pairId), {
    lastMessage: {
      text: trimmed.slice(0, LAST_MESSAGE_PREVIEW),
      senderId: uid,
      sentAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
    [`unread.${otherParticipant(pairId, uid)}`]: increment(1),
  });
  await batch.commit();
  return msgRef.id;
}

/**
 * Notify the other participant that a conversation has opened. Called only for
 * the FIRST message (the plan's "no per-message pings" rule): afterwards the
 * unread badge carries the weight, never the bell.
 */
export async function notifyConversationStarted(
  toUserId: string,
  fromHandle: string,
): Promise<void> {
  const uid = requireUid();
  await setDoc(doc(collection(getClientDb(), 'notifications')), {
    userId: toUserId,
    type: 'message',
    payload: { fromUserId: uid, fromHandle },
    readAt: null,
    createdAt: serverTimestamp(),
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

/** Total unread across all conversations — drives the header badge. */
export async function countUnreadMessages(): Promise<number> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return 0;
  const conversations = await listConversations();
  return conversations.reduce((sum, c) => sum + (c.unread[uid] ?? 0), 0);
}
