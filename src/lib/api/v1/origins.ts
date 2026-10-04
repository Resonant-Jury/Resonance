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
 *   one that connected them and each one after it while they were), `letter`
 *   once a letter's recipient has answered it, `invite_{id}` for an accepted
 *   invite, and `legacy` for a connection made before reasons were kept
 *   (written the first time anything is added to it): only resonances are
 *   ever taken back, the rest stand for good;
 * - `resonanceCards`: the resonance cards among them, what a take-back finds
 *   the document by (the card's original may be gone by then);
 * - `wrote`: who has written to the other — a message, or a note in their
 *   thread — since the connection was made. Kept here, not judged from the
 *   thread, because either of them may delete the thread.
 *
 * A new connection writes it afresh, so nothing of an earlier connection
 * between the same two (one a block ended) counts for this one. Purged with
 * either account.
 */
export const ORIGINS = 'connectionOrigins';

export type ConnectionReason =
  | { kind: 'resonance'; by: string; cardId: string; originalId: string; at: FieldValue }
  | { kind: 'letter'; by: string; at: FieldValue }
  | { kind: 'invite'; inviteId: string; at: FieldValue }
  | { kind: 'legacy'; at: FieldValue };

export const originsRef = (db: Firestore, a: string, b: string) => db.doc(`${ORIGINS}/${pairOf(a, b)}`);

/** A resonance's key among the reasons: its writer and its card. */
const resonanceKey = (by: string, cardId: string) => `resonance_${by}_${cardId}`;

export const resonanceReason = (by: string, cardId: string, originalId: string) => ({
  key: resonanceKey(by, cardId),
  reason: { kind: 'resonance', by, cardId, originalId, at: FieldValue.serverTimestamp() } as ConnectionReason,
});
export const letterReason = (by: string) => ({ key: 'letter', reason: { kind: 'letter', by, at: FieldValue.serverTimestamp() } as ConnectionReason });
export const inviteReason = (inviteId: string) => ({
  key: `invite_${inviteId}`,
  reason: { kind: 'invite', inviteId, at: FieldValue.serverTimestamp() } as ConnectionReason,
});

const isMap = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether an origins document keeps reasons: one without was written beside a connection older than them. */
const keepsReasons = (origins: DocumentSnapshot | null | undefined) => origins?.exists === true && isMap(origins.get('reasons'));

/**
 * Connect two people, in the transaction that found them not connected: the
 * connection (`extra` beside its two fields) and its origins, afresh — the
 * one reason, and `wrote` naming whoever's words made it, if anyone's did.
 */
export function connect(
  tx: Transaction,
  db: Firestore,
  [a, b]: [string, string],
  { key, reason }: { key: string; reason: ConnectionReason },
  opts: { wrote?: string; extra?: Record<string, unknown> } = {},
): void {
  const userIds = [a, b].sort();
  tx.set(db.doc(`connections/${pairOf(a, b)}`), { userIds, establishedAt: FieldValue.serverTimestamp(), ...opts.extra });
  tx.set(originsRef(db, a, b), {
    userIds,
    reasons: { [key]: reason },
    resonanceCards: reason.kind === 'resonance' ? [reason.cardId] : [],
    wrote: opts.wrote ? { [opts.wrote]: FieldValue.serverTimestamp() } : {},
  });
}

/**
 * One more reason two people already connected are (`origins` as read in the
 * same transaction): kept beside the others. A connection older than reasons
 * gets `legacy` with its first one, so taking that one back never ends it.
 */
export function addReason(
  tx: Transaction,
  db: Firestore,
  [a, b]: [string, string],
  origins: DocumentSnapshot | null,
  { key, reason }: { key: string; reason: ConnectionReason },
): void {
  const legacy = keepsReasons(origins) ? {} : { legacy: { kind: 'legacy', at: FieldValue.serverTimestamp() } };
  tx.set(
    originsRef(db, a, b),
    {
      userIds: [a, b].sort(),
      reasons: { ...legacy, [key]: reason },
      ...(reason.kind === 'resonance' ? { resonanceCards: FieldValue.arrayUnion(reason.cardId) } : {}),
    },
    { merge: true },
  );
}

/** `uid` wrote to `other`, who are connected (or connecting in this transaction). A blind write: nothing is read. */
export function noteWrote(tx: Transaction, db: Firestore, uid: string, other: string): void {
  tx.set(originsRef(db, uid, other), { userIds: [uid, other].sort(), wrote: { [uid]: FieldValue.serverTimestamp() } }, { merge: true });
}

/** What taking one resonance back does to one pair (readTakeBack → takeBack). */
export interface TakeBack {
  origins: DocumentReference;
  connection: DocumentReference;
  key: string;
  cardId: string;
  /** Nothing else keeps the two connected and the original's author never wrote: the connection goes. */
  ends: boolean;
}

/**
 * Read, in `tx` before it writes, what taking back `uid`'s resonance `cardId`
 * means: the reason it stands for (found by the card, whatever it answers or
 * whether that is still there), and whether the connection goes with it — only
 * when no other reason is left (another resonance either way, an answered
 * letter, an invite, a connection older than reasons) and the other person,
 * the original's author, has not written to them since they were connected. A
 * message from the resonator keeps nothing: they can't keep a connection by
 * writing into it themselves.
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
    const other = (d.get('userIds') as unknown[]).find((u) => u !== uid);
    const wrote = d.get('wrote');
    const heard = typeof other === 'string' && isMap(wrote) && wrote[other] != null;
    return { origins: d.ref, connection: connections[i].ref, key, cardId, ends: connections[i].exists && !left.length && !heard };
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
