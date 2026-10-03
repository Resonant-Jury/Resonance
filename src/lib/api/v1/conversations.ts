import { FieldValue, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import type { MessagePush } from '@/lib/push/chat';
import { ApiFailure } from './http';
import { visibleCardById } from './reads';

/** notes.ts / firestore.rules: a note's length, and the bell's preview of it. */
export const NOTE_MAX_LENGTH = 2000;
export const NOTE_PREVIEW_CHARS = 140;
/** messages.ts / firestore.rules: a message's length, and the list's preview of the last one. */
export const MESSAGE_MAX_LENGTH = 2000;
export const LAST_MESSAGE_PREVIEW = 120;

/** The id of the conversation (and connection) between two people: their user ids, sorted, joined by "_". */
export const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Cut by code points, so an emoji is never split in half. */
export const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');
/** How much of the message it answers a reply quotes (code points). */
export const REPLY_QUOTE_CHARS = 140;

/** What a message is, beyond words and a card: `note` — a note (小紙條) left on the recipient's card, carried into the thread. */
export const NOTE_MESSAGE_KIND = 'note';

/**
 * Whether a profile has a pen name — what reaching anyone takes: a note, a
 * message, a resonance's connection and bell, accepting an invite. Whatever
 * reaches someone shows them who it is from (the bell, the thread, the push
 * all carry the name), and an account that never chose one has no page they
 * could block or report it from.
 */
export function hasPenName(me: DocumentSnapshot | null | undefined): boolean {
  const handle = me?.exists ? me.get('handle') : null;
  return typeof handle === 'string' && handle.trim().length > 0;
}

/** The refusal for someone without a pen name (see hasPenName). */
export const noPenName = () => new ApiFailure('forbidden', 'Choose a pen name first.');

/**
 * Send a note (小紙條) to a card's author: what the web's sendNote() does from
 * the client (client/notes.ts), with the author taken from the card — so the
 * app never needs to know who wrote an anonymous one — and with the rules'
 * guarantees re-checked: a card the sender can read, not their own, no block
 * either way. The note rings the author's bell and connects the two, so the
 * author can answer in Messages; an anonymous card connects no one (the
 * connection would name its author, as a resonance to it doesn't either).
 *
 * A note on a named card also lands in the two people's conversation (opened
 * if need be) as a message of its own — `conversations/{pair}/messages/{noteId}`
 * = `{ senderId, text, sentAt, cardRef: cardId, kind: 'note' }` — so both see
 * it in their thread, the author answers it like any message, and it counts
 * as unread there. Its bell row is then written already pushed: the chat push
 * is the one buzz. A note on an anonymous card stays out of every thread,
 * even between two people already connected: the conversation would tell the
 * sender whose card it was. It rings through its bell row, as before.
 */
export interface SentNote {
  id: string;
  /** The author's bell row, for its push (never returned to the client). */
  notificationId: string;
  /** What `pushMessage` needs, when the note went into the thread — null on an anonymous card (its bell row rings). */
  push: MessagePush | null;
}

export async function sendNote(db: Firestore, uid: string, input: { cardId: string; text: string }): Promise<SentNote> {
  const card = await visibleCardById(db, uid, input.cardId);
  if (!card.publishedAt) throw new ApiFailure('not_found', 'No such card.');
  const author = card.authorId;
  if (author === uid) throw new ApiFailure('invalid_request', 'You cannot send a note to yourself.');
  const pair = pairOf(uid, author);
  const connection = db.doc(`connections/${pair}`);
  const conversation = db.doc(`conversations/${pair}`);
  const threaded = !card.anonymous;

  return db.runTransaction(async (tx) => {
    const [me, blockOut, blockIn, connected, convo] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${author}`)),
      tx.get(db.doc(`users/${author}/blocks/${uid}`)),
      tx.get(connection),
      threaded ? tx.get(conversation) : Promise.resolve(null),
    ]);
    // One answer for both directions: the sender must not learn they were blocked.
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot send a note to this person.');
    if (!hasPenName(me)) throw noPenName();

    const note = db.collection('notes').doc();
    tx.set(note, {
      cardId: card.id,
      fromUserId: uid,
      toUserId: author,
      text: input.text,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    const bell = db.collection('notifications').doc();
    tx.set(bell, {
      userId: author,
      type: 'note',
      payload: {
        noteId: note.id,
        cardId: card.id,
        fromUserId: uid,
        fromHandle: String(me.get('handle') ?? ''),
        preview: cut(input.text, NOTE_PREVIEW_CHARS),
      },
      readAt: null,
      // In the thread, the chat push rings it (pushedAt marks the row's own push done).
      ...(threaded ? { pushedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    // Never over an existing connection: that would drop what it carries (muted, its date).
    if (!connected.exists && threaded) {
      tx.set(connection, { userIds: [uid, author].sort(), establishedAt: FieldValue.serverTimestamp() });
    }
    if (!threaded) return { id: note.id, notificationId: bell.id, push: null };

    if (!convo?.exists) {
      tx.set(conversation, {
        participants: [uid, author].sort(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: null,
        unread: { [uid]: 0, [author]: 0 },
      });
    }
    // The note's own id: one note, one message (and `?note=` finds it). No
    // `noteRef` — on a message that means "answers a note".
    tx.set(conversation.collection('messages').doc(note.id), {
      senderId: uid,
      text: input.text,
      sentAt: FieldValue.serverTimestamp(),
      cardRef: card.id,
      kind: NOTE_MESSAGE_KIND,
    });
    tx.set(conversation, {
      lastMessage: { text: cut(input.text, LAST_MESSAGE_PREVIEW), senderId: uid, sentAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      unread: { [author]: FieldValue.increment(1) },
    }, { merge: true });
    return { id: note.id, notificationId: bell.id, push: { conversationId: pair, messageId: note.id, from: uid, to: author } };
  });
}

export interface SentMessage {
  conversationId: string;
  id: string;
  /** Always null: a message no longer rings a bell row of its own after the first (kept for older callers). */
  notificationId: string | null;
  /**
   * The sender had already sent this message (same `clientId`): nothing was
   * written, so there is nothing to push or unfurl either.
   */
  duplicate: boolean;
  /** What `pushMessage` needs to ring the recipient — null for a duplicate. */
  push: MessagePush | null;
}

/** Firestore reserves ids shaped `__name__`; a `clientId` is the document's id. */
const RESERVED_ID = /^__.*__$/;

/**
 * Send a message to someone you're connected with: the web's openConversation
 * + sendMessage (+ the first message's bell) in one transaction. The rules'
 * conditions are re-checked — a connection, no block either way, a
 * non-empty message unless it carries a card (one you can read). A reply to
 * a note carries its noteRef so the thread shows what it answers.
 *
 * `replyTo` names a message of this same conversation; the new message keeps
 * a snapshot of it (`replyTo: { id, senderId, text, cardRef? }`, the text cut
 * to REPLY_QUOTE_CHARS) so the thread can quote it without reading it, and
 * so the quote survives the original being deleted with the conversation.
 *
 * `clientId` makes sending retry-safe: it becomes the message's id, and
 * sending the same one again — the answer was lost — finds the message
 * already written and returns it as it is (`duplicate`), counting no unread,
 * ringing no bell. A `clientId` that names someone else's message is refused.
 *
 * The first message of a conversation still writes its bell row, but already
 * marked pushed: the chat push (`pushMessage`, which rings for every message)
 * is the one that buzzes, never two.
 *
 * The sender needs a pen name (hasPenName): the thread, its bell and every
 * push name them.
 */
export async function sendMessage(
  db: Firestore,
  uid: string,
  input: {
    to: string;
    text: string;
    cardRef?: string | null;
    noteRef?: { cardId: string; noteId: string } | null;
    replyTo?: string | null;
    clientId?: string | null;
  },
): Promise<SentMessage> {
  const other = input.to;
  if (other === uid) throw new ApiFailure('invalid_request', 'You cannot message yourself.');
  if (!input.text && !input.cardRef) throw new ApiFailure('invalid_request', 'A message needs text or a card.');
  if (input.clientId && RESERVED_ID.test(input.clientId)) throw new ApiFailure('invalid_request', 'Not a valid client id.');
  // An id Firestore keeps for itself names no message (and would throw if asked for as a document).
  if (input.replyTo && RESERVED_ID.test(input.replyTo)) throw new ApiFailure('invalid_request', 'No such message to reply to.');
  const card = input.cardRef ? await visibleCardById(db, uid, input.cardRef) : null;
  if (card && !card.publishedAt) throw new ApiFailure('not_found', 'No such card.');
  const pair = pairOf(uid, other);
  const conversation = db.doc(`conversations/${pair}`);
  const messages = conversation.collection('messages');
  const message = input.clientId ? messages.doc(input.clientId) : messages.doc();

  return db.runTransaction(async (tx) => {
    const [me, blockOut, blockIn, connection, convo, note, existing, replied] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(db.doc(`connections/${pair}`)),
      tx.get(conversation),
      input.noteRef ? tx.get(db.doc(`notes/${input.noteRef.noteId}`)) : Promise.resolve(null),
      input.clientId ? tx.get(message) : Promise.resolve(null),
      input.replyTo ? tx.get(messages.doc(input.replyTo)) : Promise.resolve(null),
    ]);
    // The same message again: what the first send wrote is the answer, whatever has changed since.
    if (existing?.exists) {
      if (existing.get('senderId') !== uid) throw new ApiFailure('invalid_request', 'Not a valid client id.');
      return { conversationId: pair, id: message.id, notificationId: null, duplicate: true, push: null };
    }
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot message this person.');
    if (!hasPenName(me)) throw noPenName();
    // Connected first (a resonance or a note connects you); a block also ends the connection.
    if (!connection.exists) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
    // A quoted note must be one between the two of you.
    if (note && (!note.exists || note.get('cardId') !== input.noteRef!.cardId
      || ![uid, other].includes(note.get('fromUserId')) || ![uid, other].includes(note.get('toUserId')))) {
      throw new ApiFailure('invalid_request', 'That note is not between you two.');
    }
    // A reply answers a message of this conversation (the path alone keeps it from being anyone else's).
    if (replied && !replied.exists) throw new ApiFailure('invalid_request', 'No such message to reply to.');

    const first = !convo.exists;
    if (first) {
      tx.set(conversation, {
        participants: [uid, other].sort(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: null,
        unread: { [uid]: 0, [other]: 0 },
      });
    }
    const quoted = replied?.exists ? replyQuote(replied) : null;
    tx.set(message, {
      senderId: uid,
      text: input.text,
      sentAt: FieldValue.serverTimestamp(),
      ...(card ? { cardRef: card.id } : {}),
      ...(input.noteRef ? { noteRef: { cardId: input.noteRef.cardId, noteId: input.noteRef.noteId } } : {}),
      ...(quoted ? { replyTo: quoted } : {}),
    });
    // The list's preview: the text, or the attached card's title when there is none.
    tx.set(conversation, {
      lastMessage: { text: cut(input.text || card?.thoughtCore || '', LAST_MESSAGE_PREVIEW), senderId: uid, sentAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      unread: { [other]: FieldValue.increment(1) },
    }, { merge: true });
    if (first) {
      // The bell lists a new conversation, but the push for it is the chat push's (pushedAt marks it done).
      tx.set(db.collection('notifications').doc(), {
        userId: other,
        type: 'message',
        payload: { fromUserId: uid, fromHandle: String(me.get('handle') ?? '') },
        readAt: null,
        pushedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return {
      conversationId: pair,
      id: message.id,
      notificationId: null,
      duplicate: false,
      push: { conversationId: pair, messageId: message.id, from: uid, to: other },
    };
  });
}

/** What a reply keeps of the message it answers. */
function replyQuote(original: DocumentSnapshot): { id: string; senderId: string; text: string; cardRef?: string } {
  const cardRef = original.get('cardRef');
  return {
    id: original.id,
    senderId: String(original.get('senderId') ?? ''),
    text: cut(String(original.get('text') ?? ''), REPLY_QUOTE_CHARS),
    ...(typeof cardRef === 'string' && cardRef ? { cardRef } : {}),
  };
}
