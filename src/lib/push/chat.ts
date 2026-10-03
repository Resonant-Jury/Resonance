import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import type { MulticastMessage } from 'firebase-admin/messaging';
import { createTranslator } from 'next-intl';
import en from '@/messages/en.json';
import zhTW from '@/messages/zh-TW.json';
import { cut, pairOf } from '@/lib/api/v1/conversations';
import type { DeviceLocale } from './devices';
import {
  MESSAGES_CHANNEL,
  deviceTargets,
  forgetDevices,
  groupByLocale,
  multicastTo,
  pushRoute,
  type DeviceTarget,
  type PushResult,
  type PushSender,
} from './send';

/**
 * A chat message's push. Unlike a bell row's (`pushNotification`, once per
 * row), every message rings: the message is the record, the push only tells
 * the phone. Written for what a conversation needs — a build that draws its
 * own stack of lines, and a lock screen that groups them — and with the same
 * rules as every push here: words from the records and not the request, and
 * silence across a block.
 */

/** The capability an Android build registers when it draws a conversation's messages itself. */
export const CHAT_PUSH_CAPABILITY = 'chat-push';
/** How much of a message the push carries (code points). */
export const PUSH_BODY_CHARS = 140;

const MESSAGES = { en, 'zh-TW': zhTW } as const satisfies Record<DeviceLocale, unknown>;

export interface MessagePush {
  conversationId: string;
  messageId: string;
  /** The sender and the recipient (user ids). */
  from: string;
  to: string;
}

const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** "Shared a card" in the device's language: what a message with no words says. */
function cardLine(locale: DeviceLocale): string {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: 'app.notifications' })('messageCard');
}

/** Whether `muted` (connections/{pair}.muted: `{ by }[]`) holds the recipient. */
function mutedBy(muted: unknown, uid: string): boolean {
  return Array.isArray(muted) && muted.some((m) => m && typeof m === 'object' && (m as { by?: unknown }).by === uid);
}

function epochMillis(value: unknown): number {
  const at = value as { toMillis?: () => number } | undefined;
  return typeof at?.toMillis === 'function' ? at.toMillis() : Date.now();
}

/**
 * Push `conversations/{pair}/messages/{id}` to its recipient's devices. Never
 * throws into a writer (it runs after the response) and returns null when
 * nothing may ring: no such message from that sender, a block either way, or
 * the recipient muted the connection.
 *
 * - A device registered with `chat-push` (Android) gets a data-only,
 *   high-priority message with everything its notification needs
 *   (`conversationId, messageId, fromUserId, fromHandle, title, body, route,
 *   sentAt`), already in its language.
 * - Every other device gets a notification message — the sender's pen name
 *   and the words — that the system shows on its own: Android replaces a
 *   conversation's earlier one (`tag`), iOS groups them (`threadId`).
 * - The title is the sender's pen name as it is now; the body is the
 *   message's text (140 code points), or "Shared a card" when it has none.
 */
export async function pushMessage(db: Firestore, push: MessagePush, sender: PushSender): Promise<PushResult | null> {
  const { conversationId, messageId, from, to } = push;
  if (![conversationId, messageId, from, to].every((v) => DOC_ID.test(v)) || from === to || conversationId !== pairOf(from, to)) return null;

  const [message, blockedByRecipient, blockedBySender, connection, author, devices] = await Promise.all([
    db.doc(`conversations/${conversationId}/messages/${messageId}`).get(),
    db.doc(`users/${to}/blocks/${from}`).get(),
    db.doc(`users/${from}/blocks/${to}`).get(),
    db.doc(`connections/${conversationId}`).get(),
    db.doc(`users/${from}`).get(),
    db.collection('devices').where('userId', '==', to).get(),
  ]);
  if (!message.exists || message.get('senderId') !== from) return null;
  if (blockedByRecipient.exists || blockedBySender.exists) return null;
  if (mutedBy(connection.get('muted'), to)) return null;
  if (devices.empty) return { sent: 0, pruned: 0 };

  const handle = str(author.get('handle'));
  const title = handle || 'Resonance';
  const words = cut(str(message.get('text')).trim(), PUSH_BODY_CHARS);
  const route = pushRoute('message', { fromHandle: handle });
  const sentAt = String(epochMillis(message.get('sentAt')));

  let sent = 0;
  const dead: DocumentReference[] = [];
  const send = async (targets: DeviceTarget[], build: (tokens: string[]) => MulticastMessage) => {
    const result = await multicastTo(sender, targets, build);
    sent += result.sent;
    dead.push(...result.dead);
  };

  for (const [locale, targets] of groupByLocale(deviceTargets(devices.docs))) {
    const body = words || cardLine(locale);
    // Only Android builds draw their own notification; a build on another platform that names the capability still gets a push the system shows.
    const draws = (t: DeviceTarget) => t.platform === 'android' && t.capabilities.includes(CHAT_PUSH_CAPABILITY);
    const own = targets.filter(draws);
    const system = targets.filter((t) => !draws(t));

    if (own.length) {
      await send(own, (tokens) => ({
        tokens,
        data: { type: 'message', conversationId, messageId, fromUserId: from, fromHandle: handle, title, body, route, sentAt },
        android: { priority: 'high' },
      }));
    }
    if (system.length) {
      await send(system, (tokens) => ({
        tokens,
        notification: { title, body },
        // `notificationId` is empty: no bell row stands behind a message (older builds read the key).
        data: { type: 'message', notificationId: '', route, fromUserId: from, conversationId, messageId },
        android: { priority: 'high', notification: { channelId: MESSAGES_CHANNEL, tag: conversationId } },
        apns: { payload: { aps: { sound: 'default', threadId: conversationId } } },
      }));
    }
  }
  await forgetDevices(db, dead);
  return { sent, pruned: dead.length };
}
