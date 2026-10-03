import { Timestamp, type DocumentReference, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { LAST_MESSAGE_PREVIEW, NOTE_MESSAGE_KIND, cut, pairOf } from '../../src/lib/api/v1/conversations';

/** Why a note stays out of the thread. */
export type NoteSkip =
  /** Its message is already in the conversation (sent since the change, or an earlier run). */
  | 'already'
  /** Not a note the server could have written: no sender, recipient, card, words or date. */
  | 'malformed'
  /** The card is gone or no longer published. */
  | 'cardGone'
  /** The card is anonymous now: a thread would tell the sender whose it is. */
  | 'anonymous'
  /** The card's author isn't the note's recipient. */
  | 'notTheAuthor'
  /** The sender's or the recipient's account is gone. */
  | 'userGone'
  /** A block stands between the two, either way. */
  | 'blocked'
  /** The two aren't connected (a block ended it, or one of them let it go). */
  | 'notConnected';

export interface NoteBackfillReport {
  notes: number;
  /** Notes whose message is written (or would be, without `apply`). */
  threaded: number;
  /** Conversations opened for them (or that would be): none existed between the two. */
  conversationsOpened: number;
  skipped: Record<NoteSkip, number>;
}

interface Note {
  id: string;
  from: string;
  to: string;
  cardId: string;
  text: string;
  createdAt: Timestamp;
}

const READ_CHUNK = 300;
/** Notes per transaction: each is a message write, beside the conversation's. */
const WRITE_CHUNK = 200;

async function getAll(db: Firestore, refs: DocumentReference[]): Promise<Map<string, DocumentSnapshot>> {
  const out = new Map<string, DocumentSnapshot>();
  for (let start = 0; start < refs.length; start += READ_CHUNK) {
    const chunk = refs.slice(start, start + READ_CHUNK);
    if (chunk.length) for (const snap of await db.getAll(...chunk)) out.set(snap.ref.path, snap);
  }
  return out;
}

const millis = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);

/**
 * Carry the notes left before notes went into the thread (sendNote) into the
 * two people's conversation, as sendNote does now: `conversations/{pair}/
 * messages/{noteId}` = `{ senderId, text, sentAt: the note's createdAt,
 * cardRef, kind: 'note' }`, oldest first.
 *
 * A note stays out (counted by reason) when its message is already there, its
 * card is gone, unpublished or anonymous now, the card's author isn't its
 * recipient, either account is gone, a block stands between them, or they
 * aren't connected. Unread counts are never touched — these are old words,
 * not news. On a conversation that exists, `lastMessage` and `updatedAt`
 * only ever move forward; a missing one is opened (dated by its first note,
 * nothing unread). That cannot tell "never talked" from "deleted the
 * conversation", so running it can bring back a conversation someone deleted.
 *
 * Messages are written with create() inside one transaction per conversation
 * (re-reading what is there), so a second run, or one racing the server,
 * writes nothing twice. With `apply: false` it only reports.
 */
export async function backfillNotes(db: Firestore, opts: { apply: boolean; log?: (line: string) => void }): Promise<NoteBackfillReport> {
  const log = opts.log ?? console.log;
  const snaps = await db.collection('notes').get();
  const skipped: Record<NoteSkip, number> = {
    already: 0, malformed: 0, cardGone: 0, anonymous: 0, notTheAuthor: 0, userGone: 0, blocked: 0, notConnected: 0,
  };
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  // An id that can stand in a path as one segment (anything else names no account or card the server wrote).
  const id = (v: unknown) => {
    const s = str(v);
    return s && !s.includes('/') && s !== '.' && s !== '..' && !/^__.*__$/.test(s) ? s : '';
  };

  const notes: Note[] = [];
  for (const d of snaps.docs) {
    const note = { id: d.id, from: id(d.get('fromUserId')), to: id(d.get('toUserId')), cardId: id(d.get('cardId')), text: str(d.get('text')), createdAt: d.get('createdAt') };
    if (!note.from || !note.to || note.from === note.to || !note.cardId || !note.text.trim() || !(note.createdAt instanceof Timestamp)) {
      skipped.malformed++;
      continue;
    }
    notes.push(note as Note);
  }
  // Oldest first: the order they were left in, and the order a conversation's preview moves through them.
  notes.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis() || (a.id < b.id ? -1 : 1));

  const pairOfNote = (n: Note) => pairOf(n.from, n.to);
  const message = (n: Note) => db.doc(`conversations/${pairOfNote(n)}/messages/${n.id}`);
  const unique = <T>(xs: T[]) => [...new Set(xs)];
  const pairs = unique(notes.map(pairOfNote));
  const people = unique(notes.flatMap((n) => [n.from, n.to]));
  const blocks = unique(notes.flatMap((n) => [`users/${n.from}/blocks/${n.to}`, `users/${n.to}/blocks/${n.from}`]));
  const read = await getAll(db, [
    ...notes.map(message),
    ...unique(notes.map((n) => n.cardId)).map((id) => db.doc(`cards/${id}`)),
    ...people.map((uid) => db.doc(`users/${uid}`)),
    ...blocks.map((path) => db.doc(path)),
    ...pairs.flatMap((pair) => [db.doc(`connections/${pair}`), db.doc(`conversations/${pair}`)]),
  ]);
  const exists = (path: string) => read.get(path)?.exists === true;

  const byPair = new Map<string, Note[]>();
  for (const n of notes) {
    const card = read.get(`cards/${n.cardId}`);
    const reason: NoteSkip | null = exists(message(n).path)
      ? 'already'
      : !card?.exists || card.get('publishedAt') == null
        ? 'cardGone'
        : card.get('anonymous') === true
          ? 'anonymous'
          : card.get('authorId') !== n.to
            ? 'notTheAuthor'
            : !exists(`users/${n.from}`) || !exists(`users/${n.to}`)
              ? 'userGone'
              : exists(`users/${n.from}/blocks/${n.to}`) || exists(`users/${n.to}/blocks/${n.from}`)
                ? 'blocked'
                : !exists(`connections/${pairOfNote(n)}`)
                  ? 'notConnected'
                  : null;
    if (reason) skipped[reason]++;
    else byPair.set(pairOfNote(n), [...(byPair.get(pairOfNote(n)) ?? []), n]);
  }

  const todo = [...byPair.values()];
  const report: NoteBackfillReport = {
    notes: snaps.size,
    threaded: todo.reduce((sum, list) => sum + list.length, 0),
    conversationsOpened: [...byPair.keys()].filter((pair) => !exists(`conversations/${pair}`)).length,
    skipped,
  };
  log(`notes: ${report.notes}; to carry into a thread: ${report.threaded}, opening ${report.conversationsOpened} conversation(s)`);
  for (const [reason, count] of Object.entries(skipped)) if (count) log(`  left out (${reason}): ${count}`);
  if (report.conversationsOpened) log('  (an opened conversation may be one its people had deleted)');
  if (!opts.apply || !todo.length) return report;

  let written = 0;
  let opened = 0;
  for (const list of todo) {
    for (let start = 0; start < list.length; start += WRITE_CHUNK) {
      const chunk = list.slice(start, start + WRITE_CHUNK);
      const [first] = chunk;
      const conversation = db.doc(`conversations/${pairOfNote(first)}`);
      const result = await db.runTransaction(async (tx) => {
        const [convo, ...messages] = await tx.getAll(conversation, ...chunk.map(message));
        const fresh = chunk.filter((_, i) => !messages[i].exists);
        if (!fresh.length) return { written: 0, opened: false };
        for (const n of fresh) {
          tx.create(message(n), { senderId: n.from, text: n.text, sentAt: n.createdAt, cardRef: n.cardId, kind: NOTE_MESSAGE_KIND });
        }
        const latest = fresh[fresh.length - 1];
        const lastMessage = { text: cut(latest.text, LAST_MESSAGE_PREVIEW), senderId: latest.from, sentAt: latest.createdAt };
        if (!convo.exists) {
          tx.create(conversation, {
            participants: [latest.from, latest.to].sort(),
            createdAt: fresh[0].createdAt,
            updatedAt: latest.createdAt,
            lastMessage,
            unread: { [latest.from]: 0, [latest.to]: 0 },
          });
          return { written: fresh.length, opened: true };
        }
        // Only ever forward: a conversation's newer words stay its preview.
        const at = latest.createdAt.toMillis();
        const lastAt = millis(convo.get('lastMessage.sentAt'));
        const updatedAt = millis(convo.get('updatedAt'));
        const update: Record<string, unknown> = {};
        if (lastAt == null || at > lastAt) update.lastMessage = lastMessage;
        if (updatedAt == null || at > updatedAt) update.updatedAt = latest.createdAt;
        if (Object.keys(update).length) tx.update(conversation, update);
        return { written: fresh.length, opened: false };
      });
      written += result.written;
      if (result.opened) opened++;
    }
  }
  log(`carried ${written} note(s) into threads, opened ${opened} conversation(s)`);
  return report;
}
