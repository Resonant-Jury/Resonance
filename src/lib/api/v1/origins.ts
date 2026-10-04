import { FieldPath, FieldValue, type DocumentReference, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { pairOf } from './conversations';

/**
 * Why two people are connected — `connectionOrigins/{pair}`, beside the
 * connection and with the same id, server-only (the rules close it: it names
 * which card of whose made the connection, and a resonance can be made
 * anonymous later). It is what lets taking a resonance back take back the
 * connection it alone stands for, and nothing else:
 *
 * - `reasons`: every reason the two are connected now, by key —
 *   `resonance_{by}_{cardId}` for each standing resonance that reached (the
 *   one that connected them and each one after it while they were),
 *   `answered_{writer}` once the original's author of a standing resonance
 *   has written to its writer (a message, or a note in their thread: the
 *   resonance answered), `letter` once a letter's recipient has answered it,
 *   `invite_{id}` for an accepted invite, and `legacy` for a connection made
 *   before reasons were kept (written the first time anything is added to
 *   it). Only resonances are ever taken back; the rest stand for good, so
 *   taking one back ends the connection exactly when no reason is left;
 * - `resonanceCards`: the resonance cards among them, what a take-back finds
 *   the document by (the card's original may be gone by then).
 *
 * An answer is recorded in the transaction of the words that make it, read
 * against the reasons as they stand then: words written before a resonance
 * never answer it, and the resonator's own words answer nothing. Kept here,
 * not judged from the thread, because either of them may delete the thread.
 *
 * A new connection writes it afresh, so nothing of an earlier connection
 * between the same two (one a block ended) counts for this one. Purged with
 * either account.
 */
export const ORIGINS = 'connectionOrigins';

export type ConnectionReason =
  | { kind: 'resonance'; by: string; cardId: string; originalId: string; at: FieldValue }
  /** `by`, the original's author, wrote to `to`, whose resonance with their card stood. */
  | { kind: 'answered'; by: string; to: string; at: FieldValue }
  | { kind: 'letter'; by: string; at: FieldValue }
  | { kind: 'invite'; inviteId: string; at: FieldValue }
  | { kind: 'legacy'; at: FieldValue };

/** A reason and its key among the reasons. */
export interface KeyedReason {
  key: string;
  reason: ConnectionReason;
}

export const originsRef = (db: Firestore, a: string, b: string) => db.doc(`${ORIGINS}/${pairOf(a, b)}`);

/** A resonance's key among the reasons: its writer and its card. */
const resonanceKey = (by: string, cardId: string) => `resonance_${by}_${cardId}`;

export const resonanceReason = (by: string, cardId: string, originalId: string): KeyedReason => ({
  key: resonanceKey(by, cardId),
  reason: { kind: 'resonance', by, cardId, originalId, at: FieldValue.serverTimestamp() },
});
export const letterReason = (by: string): KeyedReason => ({ key: 'letter', reason: { kind: 'letter', by, at: FieldValue.serverTimestamp() } });
export const inviteReason = (inviteId: string): KeyedReason => ({
  key: `invite_${inviteId}`,
  reason: { kind: 'invite', inviteId, at: FieldValue.serverTimestamp() },
});

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether an origins document keeps reasons: one without was written beside a connection older than them. */
const keepsReasons = (origins: DocumentSnapshot | null | undefined) => origins?.exists === true && isMap(origins.get('reasons'));

/**
 * Connect two people, in the transaction that found them not connected: the
 * connection (`extra` beside its two fields) and its origins, afresh — the
 * one reason.
 */
export function connect(
  tx: Transaction,
  db: Firestore,
  [a, b]: [string, string],
  { key, reason }: KeyedReason,
  opts: { extra?: Record<string, unknown> } = {},
): void {
  const userIds = [a, b].sort();
  tx.set(db.doc(`connections/${pairOf(a, b)}`), { userIds, establishedAt: FieldValue.serverTimestamp(), ...opts.extra });
  tx.set(originsRef(db, a, b), {
    userIds,
    reasons: { [key]: reason },
    resonanceCards: reason.kind === 'resonance' ? [reason.cardId] : [],
  });
}

/**
 * More reasons two people already connected are (`origins` as read in the
 * same transaction; a null among them adds nothing, and none writes
 * nothing): kept beside the others. A connection older than reasons gets
 * `legacy` with its first one, so taking that one back never ends it.
 */
export function addReason(
  tx: Transaction,
  db: Firestore,
  [a, b]: [string, string],
  origins: DocumentSnapshot | null,
  ...added: (KeyedReason | null)[]
): void {
  const list = added.filter((r): r is KeyedReason => r != null);
  if (!list.length) return;
  const legacy = keepsReasons(origins) ? {} : { legacy: { kind: 'legacy', at: FieldValue.serverTimestamp() } };
  const cards = list.flatMap(({ reason }) => (reason.kind === 'resonance' ? [reason.cardId] : []));
  tx.set(
    originsRef(db, a, b),
    {
      userIds: [a, b].sort(),
      reasons: { ...legacy, ...Object.fromEntries(list.map(({ key, reason }) => [key, reason])) },
      ...(cards.length ? { resonanceCards: FieldValue.arrayUnion(...cards) } : {}),
    },
    { merge: true },
  );
}

/**
 * What `uid` writing to `other` — a message, or a note in their thread,
 * between two people connected (`origins` as read in the same transaction) —
 * answers: a resonance of `other`'s standing on a card of `uid`'s (its
 * original's author writing to its writer), kept as `answered_{other}` for
 * good. Null when the words answer none (no resonance of theirs stands now —
 * words before it never answer it, and a resonator's words to the original's
 * author answer nothing), or the answer is kept already.
 */
export function answeredBy(origins: DocumentSnapshot | null | undefined, uid: string, other: string): KeyedReason | null {
  if (!keepsReasons(origins)) return null;
  const reasons = origins!.get('reasons') as Record<string, unknown>;
  const key = `answered_${other}`;
  if (reasons[key] !== undefined) return null;
  // A reason of this pair's by `other` answers a card of the other one's: `uid`'s.
  const stands = Object.values(reasons).some((r) => isMap(r) && r.kind === 'resonance' && r.by === other);
  return stands ? { key, reason: { kind: 'answered', by: uid, to: other, at: FieldValue.serverTimestamp() } } : null;
}

/** What taking one resonance back does to one pair (readTakeBack → takeBack). */
export interface TakeBack {
  origins: DocumentReference;
  connection: DocumentReference;
  key: string;
  cardId: string;
  /** No other reason keeps the two connected: the connection goes. */
  ends: boolean;
}

/**
 * Read, in `tx` before it writes, what taking back `uid`'s resonance `cardId`
 * means: the reason it stands for (found by the card, whatever it answers or
 * whether that is still there), and whether the connection goes with it —
 * exactly when no other reason is left: another resonance either way, the
 * original's author's answer to one, an answered letter, an invite, a
 * connection older than reasons.
 */
export async function readTakeBack(tx: Transaction, db: Firestore, uid: string, cardId: string): Promise<TakeBack[]> {
  const found = await tx.get(db.collection(ORIGINS).where('resonanceCards', 'array-contains', cardId).limit(10));
  const key = resonanceKey(uid, cardId);
  const mine = found.docs.filter((d) => {
    const userIds = d.get('userIds');
    return keepsReasons(d) && d.get(new FieldPath('reasons', key)) !== undefined && Array.isArray(userIds) && userIds.includes(uid);
  });
  const connections = await Promise.all(mine.map((d) => tx.get(db.doc(`connections/${d.id}`))));
  return mine.map((d, i) => {
    const left = Object.keys(d.get('reasons') as Record<string, unknown>).filter((k) => k !== key);
    return { origins: d.ref, connection: connections[i].ref, key, cardId, ends: connections[i].exists && !left.length };
  });
}

/** Write what readTakeBack read: the reason goes, and the connection with its origins when nothing else holds it. */
export function takeBack(tx: Transaction, plans: TakeBack[]): void {
  for (const p of plans) {
    if (p.ends) {
      tx.delete(p.connection);
      tx.delete(p.origins);
    } else {
      tx.update(p.origins, new FieldPath('reasons', p.key), FieldValue.delete(), 'resonanceCards', FieldValue.arrayRemove(p.cardId));
    }
  }
}
