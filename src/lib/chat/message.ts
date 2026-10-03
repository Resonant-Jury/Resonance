import type { Message, MessageReplyQuote } from '@/lib/db/types';

/**
 * Where a message of the viewer's own stands: `delivered` is a document the
 * conversation holds; the rest are still on their way (see ./outbox).
 *
 * - `sending`: waiting in the outbox, or being sent.
 * - `sent`: the server took it; the conversation's listener hasn't shown it
 *   yet (drawn as delivered, but it can't be replied to yet).
 * - `failed`: the server refused it, or the network did — it stays in the
 *   thread with a retry until the viewer retries or deletes it.
 */
export type Delivery = 'delivered' | 'sending' | 'sent' | 'failed';

/**
 * One message of a conversation as the thread draws it: a document of
 * `conversations/{pair}/messages`, or one of the viewer's own still on its way
 * (the twin of the apps' ChatMessage).
 *
 * `key` is what a list keeps the row by: the id, except that a message sent
 * from here keeps the key it had while it was sending (its client id), so the
 * row is replaced in place when the document arrives instead of jumping. For
 * a message still on its way, `id` is the client id, which the server makes
 * the document's id.
 */
export interface ChatMessage extends Message {
  key: string;
  delivery: Delivery;
}

/** How much of the answered message a reply carries (the server makes the same cut). */
export const QUOTE_MAX = 140;

/** At most {@link QUOTE_MAX} code points, never splitting a surrogate pair. */
export function cutQuote(text: string): string {
  const points = Array.from(text);
  return points.length <= QUOTE_MAX ? text : points.slice(0, QUOTE_MAX).join('');
}

/** The quote a reply to `message` carries, as the server will snapshot it. */
export function quoteOf(message: Message): MessageReplyQuote {
  return {
    id: message.id,
    senderId: message.senderId,
    text: cutQuote(message.text),
    ...(message.cardRef ? { cardRef: message.cardRef } : {}),
  };
}

/** A reply names a document of the conversation, so only a delivered message can be answered. */
export function canReply(message: ChatMessage): boolean {
  return message.delivery === 'delivered';
}

/** Still on its way, or failed: the server knows nothing of it (yet). */
export function isPending(message: ChatMessage): boolean {
  return message.delivery !== 'delivered';
}
