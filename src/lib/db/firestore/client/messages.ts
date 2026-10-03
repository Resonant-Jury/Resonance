'use client';

import {
  Timestamp,
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  updateDoc,
  writeBatch,
} from './sdk';
import type { Conversation, Message } from '@/lib/db/types';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { callApi } from './api';
import { isAbsent } from './errors';
import { listenLazily } from './listen';
import { linkPreviewOf } from '@/lib/links/previewShape';

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

/**
 * A Timestamp from either SDK: Lite's for the conversation reads, the full
 * SDK's for an open thread's listener (two copies of the class, so no
 * `instanceof`).
 */
function tsToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate(): Date }).toDate();
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
    request: mapRequest(data.request),
  };
}

/**
 * The letter a conversation holds, if any: who left the notes is all that
 * matters to the thread (whose turn it is). A count the server wrote oddly
 * reads as none; a `from` that isn't a uid as no letter at all.
 */
function mapRequest(v: unknown): Conversation['request'] {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const from = str(r.from);
  if (!from) return undefined;
  return {
    from,
    cardId: str(r.cardId),
    count: typeof r.count === 'number' && Number.isInteger(r.count) && r.count >= 0 ? r.count : 0,
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
    replyTo: mapReplyQuote(data.replyTo),
    preview: mapPreview(data.preview),
    // A kind this build doesn't know is a plain message.
    ...(data.kind === 'note' ? { kind: 'note' as const } : {}),
  };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function mapReplyQuote(v: unknown): Message['replyTo'] {
  if (!v || typeof v !== 'object') return undefined;
  const q = v as Record<string, unknown>;
  const id = str(q.id);
  if (!id) return undefined;
  return {
    id,
    senderId: String(q.senderId ?? ''),
    text: typeof q.text === 'string' ? q.text : '',
    cardRef: str(q.cardRef),
  };
}

/**
 * The server writes `preview` after the message, so it arrives as a later
 * update. Only an http(s) address with a title counts, and the picture only
 * from our own link-image route — nothing else is ever put in an `<img>`.
 */
function mapPreview(v: unknown): Message['preview'] {
  return linkPreviewOf(v);
}

export interface MessageExtras {
  /** A shared card (the thread draws it as the card's own bubble). */
  cardRef?: string;
  /** The 紙條 this message replies to (quote header in the thread). */
  noteRef?: { cardId: string; noteId: string };
  /** The message this one answers (its id, in the same conversation): the server keeps a quote of it on the reply. */
  replyTo?: string;
  /**
   * The id this message was given before it was sent (lib/chat/outbox's
   * `newClientId`): the server makes it the document's id, so sending it
   * again after a lost answer finds the message instead of writing it twice.
   */
  clientId?: string;
}

/**
 * Send a message to someone you're connected with, through the server
 * (POST /api/v1/messages — the call the apps make). One transaction opens the
 * conversation on the first message, writes the message, the list preview (a
 * bodyless card share borrows the card's title) and the recipient's unread
 * counter, and rings their bell for the first message only (every message
 * pushes to their phones); it re-checks the connection, blocks, that an
 * attached card is one you can read and that a message answered is one of
 * this conversation. The rules refuse all of this from the browser. Text is
 * optional only when a card is attached. Resolves to the message's id.
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
    body: {
      to: toUserId,
      text: trimmed,
      cardRef: extras.cardRef ?? null,
      noteRef: extras.noteRef ?? null,
      replyTo: extras.replyTo ?? null,
      clientId: extras.clientId ?? null,
    },
  });
}

/** Zero the viewer's own unread counter on a conversation. */
export async function markConversationRead(pairId: string): Promise<void> {
  const uid = requireUid();
  await updateDoc(doc(getClientDb(), 'conversations', pairId), {
    [`unread.${uid}`]: 0,
  });
}

/** A single conversation, or null when missing / not a participant (a failed read throws). */
export async function getConversation(pairId: string): Promise<Conversation | null> {
  try {
    const snap = await getDoc(doc(getClientDb(), 'conversations', pairId));
    return snap.exists() ? mapConversation(snap.id, snap.data()) : null;
  } catch (e) {
    if (isAbsent(e)) return null;
    throw e;
  }
}

/**
 * Where the page of messages before a message starts: its send time (to the
 * microsecond, as Firestore orders them) and its id (which orders messages
 * sent in the same instant). Plain numbers, so the full SDK's listener can
 * hand one to a Lite read.
 */
export interface MessageCursor {
  seconds: number;
  nanoseconds: number;
  id: string;
}

/** A message with the cursor that starts the page before it. */
export interface ThreadEntry {
  message: Message;
  cursor: MessageCursor;
}

/** One answer of an open thread's listener: its newest messages, newest first. */
export interface ThreadWindow {
  entries: ThreadEntry[];
  /** From the listener's memory rather than the server: may be only part of the newest messages. */
  fromCache: boolean;
}

/** The newest messages an open thread listens to; older ones are read a page at a time. */
export const THREAD_WINDOW = 50;

/** A send time to the microsecond, from either SDK's Timestamp (by shape) or, failing that, a Date. */
function cursorOf(id: string, data: Record<string, unknown>, sentAt: Date): MessageCursor {
  const ts = data.sentAt as { seconds?: unknown; nanoseconds?: unknown } | null | undefined;
  if (ts && typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
    return { seconds: ts.seconds, nanoseconds: ts.nanoseconds, id };
  }
  const ms = sentAt.getTime();
  return { seconds: Math.floor(ms / 1000), nanoseconds: (((ms % 1000) + 1000) % 1000) * 1e6, id };
}

function entryOf(id: string, data: Record<string, unknown>): ThreadEntry {
  const message = mapMessage(id, data);
  return { message, cursor: cursorOf(id, data, message.sentAt) };
}

/**
 * Subscribe to the newest {@link THREAD_WINDOW} messages of an open thread
 * (newest first, each with its cursor) — scoped to the one thread the viewer
 * is looking at. A message that slides out of the window is not "gone": the
 * thread keeps what it has (lib/chat/history). A refusal (the conversation
 * was deleted, or isn't there yet) reaches `onError` with its
 * `permission-denied` code.
 */
export function listenThread(
  pairId: string,
  onWindow: (window: ThreadWindow) => void,
  onError?: (err: Error) => void,
  max = THREAD_WINDOW,
): () => void {
  return listenLazily(
    ({ listenNewest }) =>
      listenNewest(
        ['conversations', pairId, 'messages'],
        'sentAt',
        max,
        (docs, meta) => onWindow({ entries: docs.map((d) => entryOf(d.id, d.data)), fromCache: meta.fromCache }),
        (err) => onError?.(err),
      ),
    onError,
  );
}

/**
 * The (at most `max`) messages sent before `before`, newest first — one
 * page further back than the thread holds. Read once through Lite (only the
 * newest messages are listened to); a failed read throws.
 */
export async function getOlderMessages(pairId: string, before: MessageCursor, max: number): Promise<ThreadEntry[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'conversations', pairId, 'messages'),
      orderBy('sentAt', 'desc'),
      orderBy(documentId(), 'desc'),
      startAfter(new Timestamp(before.seconds, before.nanoseconds), before.id),
      limit(max),
    ),
  );
  return snap.docs.map((d) => entryOf(d.id, d.data()));
}

/**
 * Subscribe to the viewer's conversations, most recently active first (the
 * newest `max`): what the header's unread badge counts and the messages list
 * shows. One listener instead of reading the whole list again on a timer —
 * after its first answer, only a conversation that changed is read.
 */
export function listenConversations(
  uid: string,
  onConversations: (conversations: Conversation[]) => void,
  onError?: (err: Error) => void,
  max = 50,
): () => void {
  return listenLazily(
    ({ listenNewest }) =>
      listenNewest(
        ['conversations'],
        'updatedAt',
        max,
        (docs) => onConversations(docs.map((d) => mapConversation(d.id, d.data))),
        (err) => onError?.(err),
        [{ field: 'participants', op: 'array-contains', value: uid }],
      ),
    onError,
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
