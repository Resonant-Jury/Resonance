import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { mapCard } from '@/lib/db/firestore/mapper';
import type { MessagePush } from '@/lib/push/chat';
import { ApiFailure } from './http';
import { addReason, answeredBy, connect, letterReason, originsRef } from './origins';
import { cardVisible } from './present';
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

/** How many notes someone may leave a person they aren't connected with before that person answers (`letters/*.count`). */
export const NOTE_REQUEST_MAX = 3;

/**
 * `conversations/{pair}.request`: notes left by someone the other isn't
 * connected with, waiting for an answer — a letter (see sendNote). `from` is
 * the writer; `cardId` and `at` are their latest note's card and time;
 * `count` how many they have left unanswered (as their letters/* record
 * counts them). Written by the server only (the rules let a participant
 * change nothing but their unread count), and answered only by its
 * recipient: their message or note to its writer deletes it (and accepting
 * an invite between them does) — connecting them if they aren't. Anything
 * else that connects the two (a resonance) leaves it as it is: clients
 * ignore it while they are connected, and a resonance taken back leaves the
 * letter waiting as it was. It also goes with the conversation: either
 * participant may delete it, the writer withdrawing their letter, its
 * recipient declining it. Gone, it can no longer be answered: the
 * recipient's reply connects no one.
 */
export interface NoteRequest {
  from: string;
  count: number;
}

/** A count the server can't read counts as full: the writer waits for an answer, as they would anyway. */
const countOf = (count: unknown) => (typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : NOTE_REQUEST_MAX);

/** The letter a conversation holds, if any. */
export function openRequest(convo: DocumentSnapshot): NoteRequest | null {
  const request: unknown = convo.exists ? convo.get('request') : null;
  if (!request || typeof request !== 'object') return null;
  const { from, count } = request as { from?: unknown; count?: unknown };
  if (typeof from !== 'string' || !from) return null;
  return { from, count: countOf(count) };
}

/**
 * `letters/{writer}_{recipient}` = `{ from, to, count, at, cardId }`: how
 * many notes the writer has left someone they aren't connected with, still
 * unanswered (`at` and `cardId`: the latest one's). It is what holds the
 * writer to NOTE_REQUEST_MAX, and it lives where no one but the server
 * reaches (the rules close letters/* to clients): deleting the conversation
 * — which either of the two may do — never resets it, and neither does a
 * connection made otherwise and taken back. Answering the letter deletes it,
 * both ways (clearLetters): the recipient's message or note to its writer,
 * or an invite accepted between them. The account purge takes it from
 * either side.
 */
export const letterRef = (db: Firestore, from: string, to: string) => db.doc(`letters/${from}_${to}`);

/** How many unanswered notes a letters/* record counts (none when there is none). */
export const lettersLeft = (letter: DocumentSnapshot) => (letter.exists ? countOf(letter.get('count')) : 0);

/**
 * A letter answered: the count of each one's unanswered notes to the other
 * goes (blind deletes — a record that isn't there deletes nothing).
 */
export function clearLetters(tx: Transaction, db: Firestore, a: string, b: string): void {
  tx.delete(letterRef(db, a, b));
  tx.delete(letterRef(db, b, a));
}

/** Whether a conversation holds a `request` field at all (one to delete when it is answered). */
export const holdsRequest = (convo: DocumentSnapshot | null | undefined) => convo?.exists === true && convo.get('request') !== undefined;

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
 * either way. The note rings the author.
 *
 * A note on a named card also lands in the two people's conversation (opened
 * if need be) as a message of its own — `conversations/{pair}/messages/{noteId}`
 * = `{ senderId, text, sentAt, cardRef: cardId, kind: 'note' }` — so both see
 * it in their thread, the author answers it like any message, and it counts
 * as unread there. Its bell row is then written already pushed: the chat push
 * is the one buzz.
 *
 * A note is a letter: it connects no one by itself. Between two people who
 * aren't connected it opens, or adds to, the conversation's `request`
 * (`{ from, cardId, at, count }`, see NoteRequest), and the author's answer is
 * what connects them (sendMessage). Until they are connected, the writer may
 * leave NOTE_REQUEST_MAX notes in all — counted in letters/{writer}_{author}
 * (letterRef), which deleting the conversation leaves as it is; one more is
 * a conflict ("Wait for them to reply."), writing and ringing nothing.
 * Crossing letters: a note to someone whose own letter to the sender is
 * waiting answers it — the two are connected, `request` and both counts gone,
 * in the same transaction, the answered letter the connection's reason
 * (connectionOrigins). Between two people already connected a note is one
 * more message: it counts nothing, and answers a letter only from that
 * letter's recipient (it is kept as a reason then: a resonance taken back
 * leaves them connected); and from the original's author of a resonance of
 * the card's author's that stands, it answers that resonance — kept as a
 * reason for good (answeredBy, ./origins).
 *
 * A note on an anonymous card stays out of every thread, even between two
 * people already connected (the conversation would tell the sender whose card
 * it was), and connects, opens or answers nothing: it rings through its bell
 * row, as before. Whether it is anonymous is read in the note's transaction,
 * beside the blocks: a byline taken off a moment before still keeps it out.
 *
 * The bell of a note on an anonymous card says so (`payload.anonymous`): its
 * push opens the card (lib/push pushRoute), never a thread with the note's
 * writer, which their unread count there would answer for — and the bell
 * lists are to do the same (the clients' part, still to come).
 *
 * A block never answers for an anonymous card (the sender keeps their own
 * block list, and a refusal would name the author): across one, a note on an
 * anonymous card is answered as if delivered and delivers nothing. It is kept
 * as its writer's words — in their export like any note they wrote — but
 * addressed to no one (`toUserId: null`): no bell, no push, readable by no
 * client. It names whom it was withheld from (`withheldFor`, never read by a
 * client nor exported), so it goes with that account as a delivered note
 * goes with its recipient's. The pen name is asked first, so its refusal
 * says nothing either.
 */
export interface SentNote {
  id: string;
  /** The author's bell row, for its push (never returned to the client); null when nothing rings (withheld across a block). */
  notificationId: string | null;
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

  const letter = letterRef(db, uid, author);

  return db.runTransaction(async (tx) => {
    const [now, me, blockOut, blockIn, connected, convo, mine, origins] = await Promise.all([
      tx.get(db.doc(`cards/${card.id}`)),
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${author}`)),
      tx.get(db.doc(`users/${author}/blocks/${uid}`)),
      tx.get(connection),
      tx.get(conversation),
      tx.get(letter),
      tx.get(originsRef(db, uid, author)),
    ]);
    // The card as it is now: one deleted or hidden from the sender since the read above takes no note.
    const current = now.exists ? mapCard(now.id, now.data()!) : null;
    if (!current || current.authorId !== author || !current.publishedAt || !cardVisible(current, uid, () => connected.exists)) {
      throw new ApiFailure('not_found', 'No such card.');
    }
    // Before the blocks: whether they stand must change no answer about an anonymous card.
    if (!hasPenName(me)) throw noPenName();
    // Its byline as of this transaction: made anonymous a moment ago, it still keeps the note out of the thread.
    const threaded = current.anonymous !== true;
    if (blockOut.exists || blockIn.exists) {
      // One answer for both directions: the sender must not learn they were blocked.
      if (threaded) throw new ApiFailure('blocked', 'You cannot send a note to this person.');
      // An anonymous card: answered as delivered, delivering nothing (see SentNote).
      const withheld = db.collection('notes').doc();
      tx.set(withheld, {
        cardId: card.id,
        fromUserId: uid,
        toUserId: null,
        withheldFor: author,
        text: input.text,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { id: withheld.id, notificationId: null, push: null };
    }
    // Not connected, on a named card: a letter, waiting for its answer.
    const writing = threaded && !connected.exists;
    // Their letter to me is waiting, and this note — mine, its recipient's — answers it
    // (crossing letters when we aren't connected; connected, it is a reason we are).
    const answers = threaded && openRequest(convo)?.from === author;
    const left = writing ? lettersLeft(mine) : 0;
    if (writing && !answers && left >= NOTE_REQUEST_MAX) throw new ApiFailure('conflict', 'Wait for them to reply.');

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
        // Its bell opens the card, not a thread with the writer (see above).
        ...(threaded ? {} : { anonymous: true }),
      },
      readAt: null,
      // In the thread, the chat push rings it (pushedAt marks the row's own push done).
      ...(threaded ? { pushedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    if (!threaded) return { id: note.id, notificationId: bell.id, push: null };

    if (writing) {
      // Their letter answered: the two connected by it. Else this one waits.
      if (answers) connect(tx, db, [uid, author], letterReason(uid));
      else tx.set(letter, { from: uid, to: author, count: left + 1, cardId: card.id, at: FieldValue.serverTimestamp() });
    } else {
      // Connected: the letter it answers, and a resonance of theirs on a card of mine
      // it answers, are reasons they stay so (a take-back reads them).
      addReason(tx, db, [uid, author], origins, answers ? letterReason(uid) : null, answeredBy(origins, uid, author));
    }
    if (answers) clearLetters(tx, db, uid, author);

    if (!convo.exists) {
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
      // A letter waits for its answer; the answer leaves none waiting. Anything else leaves it as it is.
      ...(writing && !answers
        ? { request: { from: uid, cardId: card.id, at: FieldValue.serverTimestamp(), count: left + 1 } }
        : answers && holdsRequest(convo) ? { request: FieldValue.delete() } : {}),
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
 * a note carries its noteRef so the thread shows what it answers: a note the
 * recipient left the sender, nothing else. Only one left on a card under the
 * sender's name keeps it: a reply to a note on their anonymous card is sent
 * without it, quietly — the thread is the other person's to read, and the
 * note's card would tell them whose card it was. So is a reply to a note gone
 * with its card (deleting a card deletes its notes): the reply still goes,
 * and still answers a letter.
 *
 * Or answer a letter: with no connection, a message is allowed only to
 * someone whose notes to you wait in your conversation (`request.from` is
 * them, see sendNote), and that answer is what connects you — the
 * connection made, `request` and both people's letters/* counts deleted in
 * the same transaction as the message. Everyone else, the letter's own
 * writer included, is refused as before — and so is everyone once the
 * conversation holding the letter is deleted (withdrawn or declined). Between
 * two people already connected (a resonance did it) a letter still waiting is
 * answered the same way, by its recipient only, and stays a reason they are
 * connected (connectionOrigins); a message from its writer leaves it waiting.
 * A message from the original's author of a resonance that stands between
 * the two, to its writer, answers that resonance: kept as a reason for good
 * (answeredBy), so taking the resonance back leaves them connected. Words
 * before a resonance never answer it, and the resonator's answer nothing.
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
 * push name them. It is asked before the blocks, as everywhere.
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
  // A noteRef naming an id Firestore keeps for itself names no note: read as one that isn't there (one answer for all).
  const noteRef = input.noteRef && !RESERVED_ID.test(input.noteRef.noteId) && !RESERVED_ID.test(input.noteRef.cardId) ? input.noteRef : null;
  const pair = pairOf(uid, other);
  const conversation = db.doc(`conversations/${pair}`);
  const messages = conversation.collection('messages');
  const message = input.clientId ? messages.doc(input.clientId) : messages.doc();

  return db.runTransaction(async (tx) => {
    const [me, blockOut, blockIn, connection, convo, origins, note, noteCard, existing, replied] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(db.doc(`connections/${pair}`)),
      tx.get(conversation),
      tx.get(originsRef(db, uid, other)),
      noteRef ? tx.get(db.doc(`notes/${noteRef.noteId}`)) : Promise.resolve(null),
      noteRef ? tx.get(db.doc(`cards/${noteRef.cardId}`)) : Promise.resolve(null),
      input.clientId ? tx.get(message) : Promise.resolve(null),
      input.replyTo ? tx.get(messages.doc(input.replyTo)) : Promise.resolve(null),
    ]);
    // The same message again: what the first send wrote is the answer, whatever has changed since.
    if (existing?.exists) {
      if (existing.get('senderId') !== uid) throw new ApiFailure('invalid_request', 'Not a valid client id.');
      return { conversationId: pair, id: message.id, notificationId: null, duplicate: true, push: null };
    }
    if (!hasPenName(me)) throw noPenName();
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot message this person.');
    // Answering their letter (I am its recipient): without a connection, this reply is what connects the two of you.
    const answers = openRequest(convo)?.from === other;
    // Connected first (a resonance, or an answered note, connects you); a block also ends the connection.
    if (!connection.exists && !answers) throw new ApiFailure('forbidden', 'You can message people you are connected with.');
    // A note gone with its card — deleting a card deletes its notes after it —
    // is answered all the same, without saying which (as below). A card that
    // isn't yours is as gone as a missing one, so the answer never says
    // whether someone else's card is there; one of yours still there means a
    // note that never was.
    const noteGone = !!noteRef && !note?.exists && !(noteCard?.exists && noteCard.get('authorId') === uid);
    // A message answers a note they left you, on the card it names — nothing
    // else, one answer for all of it: a note of your own on an anonymous card
    // would otherwise tell you, by which error came back, whether they wrote it.
    if (input.noteRef && !noteGone && (!note?.exists || note.get('cardId') !== input.noteRef.cardId
      || note.get('fromUserId') !== other || note.get('toUserId') !== uid)) {
      throw new ApiFailure('invalid_request', 'That is not a note they left you.');
    }
    // A note they left you on a card under your name: the message says which.
    // One left on your anonymous card, or gone with its card (which may have
    // been one), is answered all the same, without saying so: the message is
    // theirs to read too, and would tell them whose card it was.
    const keptNoteRef = noteRef && note?.exists && noteCard?.exists && noteCard.get('anonymous') !== true ? noteRef : null;
    // A reply answers a message of this conversation (the path alone keeps it from being anyone else's).
    if (replied && !replied.exists) throw new ApiFailure('invalid_request', 'No such message to reply to.');

    // Connected: the letter of theirs this answers, and a resonance of theirs
    // on a card of yours it answers, are reasons you stay so (a take-back
    // reads them). Not connected, their letter answered is what connects you.
    if (connection.exists) addReason(tx, db, [uid, other], origins, answers ? letterReason(uid) : null, answeredBy(origins, uid, other));
    else connect(tx, db, [uid, other], letterReason(uid));
    if (answers) clearLetters(tx, db, uid, other);
    // An answered letter has a conversation already: no "new conversation" bell for it.
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
      ...(keptNoteRef ? { noteRef: { cardId: keptNoteRef.cardId, noteId: keptNoteRef.noteId } } : {}),
      ...(quoted ? { replyTo: quoted } : {}),
    });
    // The list's preview: the text, or the attached card's title when there is none.
    tx.set(conversation, {
      lastMessage: { text: cut(input.text || card?.thoughtCore || '', LAST_MESSAGE_PREVIEW), senderId: uid, sentAt: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
      unread: { [other]: FieldValue.increment(1) },
      // Their letter answered: it waits no more. One of yours waits on (only they answer it).
      ...(answers && holdsRequest(convo) ? { request: FieldValue.delete() } : {}),
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
