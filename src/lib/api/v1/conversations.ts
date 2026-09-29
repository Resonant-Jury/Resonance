import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { ApiFailure } from './http';
import { visibleCard } from './reads';

/** notes.ts / firestore.rules: a note's length, and the bell's preview of it. */
export const NOTE_MAX_LENGTH = 2000;
export const NOTE_PREVIEW_CHARS = 140;
/** messages.ts / firestore.rules: a message's length, and the list's preview of the last one. */
export const MESSAGE_MAX_LENGTH = 2000;
export const LAST_MESSAGE_PREVIEW = 120;

const pairOf = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
/** Cut by code points, so an emoji is never split in half. */
const cut = (text: string, n: number) => Array.from(text).slice(0, n).join('');

/**
 * Send a note (小紙條) to a card's author: what the web's sendNote() does from
 * the client (client/notes.ts), with the author taken from the card — so the
 * app never needs to know who wrote an anonymous one — and with the rules'
 * guarantees re-checked: a card the sender can read, not their own, no block
 * either way. The note rings the author's bell and connects the two, so the
 * author can answer in Messages; an anonymous card connects no one (the
 * connection would name its author, as a resonance to it doesn't either).
 */
export async function sendNote(db: Firestore, uid: string, input: { cardId: string; text: string }): Promise<string> {
  const card = await visibleCard(db, uid, input.cardId);
  if (!card.publishedAt) throw new ApiFailure('not_found', 'No such card.');
  const author = card.authorId;
  if (author === uid) throw new ApiFailure('invalid_request', 'You cannot send a note to yourself.');
  const connection = db.doc(`connections/${pairOf(uid, author)}`);

  return db.runTransaction(async (tx) => {
    const [me, blockOut, blockIn, connected] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${author}`)),
      tx.get(db.doc(`users/${author}/blocks/${uid}`)),
      tx.get(connection),
    ]);
    // One answer for both directions: the sender must not learn they were blocked.
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot send a note to this person.');
    if (!me.exists) throw new ApiFailure('forbidden', 'Choose a pen name first.');

    const note = db.collection('notes').doc();
    tx.set(note, {
      cardId: card.id,
      fromUserId: uid,
      toUserId: author,
      text: input.text,
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection('notifications').doc(), {
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
      createdAt: FieldValue.serverTimestamp(),
    });
    // Never over an existing connection: that would drop what it carries (muted, its date).
    if (!connected.exists && !card.anonymous) {
      tx.set(connection, { userIds: [uid, author].sort(), establishedAt: FieldValue.serverTimestamp() });
    }
    return note.id;
  });
}

export interface SentMessage {
  conversationId: string;
  id: string;
}

/**
 * Send a message to someone you're connected with: the web's openConversation
 * + sendMessage (+ the first message's bell) in one transaction. The rules'
 * conditions are re-checked — a connection, no block either way, a
 * non-empty message unless it carries a card (one you can read). A reply to
 * a note carries its noteRef so the thread shows what it answers.
 */
export async function sendMessage(
  db: Firestore,
  uid: string,
  input: { to: string; text: string; cardRef?: string | null; noteRef?: { cardId: string; noteId: string } | null },
): Promise<SentMessage> {
  const other = input.to;
  if (other === uid) throw new ApiFailure('invalid_request', 'You cannot message yourself.');
  if (!input.text && !input.cardRef) throw new ApiFailure('invalid_request', 'A message needs text or a card.');
  const card = input.cardRef ? await visibleCard(db, uid, input.cardRef) : null;
  if (card && !card.publishedAt) throw new ApiFailure('not_found', 'No such card.');
  const pair = pairOf(uid, other);
  const conversation = db.doc(`conversations/${pair}`);

  return db.runTransaction(async (tx) => {
    const [me, blockOut, blockIn, connection, convo, note] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(db.doc(`connections/${pair}`)),
      tx.get(conversation),
      input.noteRef ? tx.get(db.doc(`notes/${input.noteRef.noteId}`)) : Promise.resolve(null),
    ]);
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot message this person.');
    // Connected first (a resonance or a note connects you); a block also ends the connection.
    if (!connection.exists) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
    // A quoted note must be one between the two of you.
    if (note && (!note.exists || note.get('cardId') !== input.noteRef!.cardId
      || ![uid, other].includes(note.get('fromUserId')) || ![uid, other].includes(note.get('toUserId')))) {
      throw new ApiFailure('invalid_request', 'That note is not between you two.');
    }

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
    const message = conversation.collection('messages').doc();
    tx.set(message, {
      senderId: uid,
      text: input.text,
      sentAt: FieldValue.serverTimestamp(),
      ...(card ? { cardRef: card.id } : {}),
      ...(input.noteRef ? { noteRef: { cardId: input.noteRef.cardId, noteId: input.noteRef.noteId } } : {}),
    });
    // The list's preview: the text, or the attached card's title when there is none.
    tx.set(conversation, {
      lastMessage: { text: cut(input.text || card?.thoughtCore || '', LAST_MESSAGE_PREVIEW), senderId: uid, sentAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      unread: { [other]: FieldValue.increment(1) },
    }, { merge: true });
    if (first) {
      tx.set(db.collection('notifications').doc(), {
        userId: other,
        type: 'message',
        payload: { fromUserId: uid, fromHandle: String(me.get('handle') ?? '') },
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { conversationId: pair, id: message.id };
  });
}
