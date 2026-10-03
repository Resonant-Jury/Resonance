import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { hasPenName, noPenName, pairOf } from './conversations';
import { ApiFailure } from './http';

export interface AcceptedInvite {
  /** connections/{id}: the two user ids, sorted, joined by "_". */
  connectionId: string;
  /** The sender's bell row, for its push (never returned to the client); null when nothing rang. */
  notificationId: string | null;
}

/**
 * Accept a legacy invite (none are sent any more; the pending ones are still
 * answered). What the web's acceptInvite() did from the browser, in one
 * transaction: the invite goes from pending to accepted, the two are
 * connected — naming the invite; a connection they already have (a
 * resonance or a note made it since) is kept as it is — and the sender's
 * bell rings "invite accepted", under the recipient's pen name as it is now.
 *
 * Only its recipient may accept it: anyone else's is not_found. A block
 * either way refuses it; one no longer pending (declined, withdrawn) is a
 * conflict. Accepting twice is harmless: the second answers the same
 * connection and rings nothing.
 */
export async function acceptInvite(db: Firestore, uid: string, inviteId: string): Promise<AcceptedInvite> {
  const ref = db.doc(`invites/${inviteId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const other = snap.exists ? snap.get('fromUserId') : null;
    if (!snap.exists || snap.get('toUserId') !== uid || typeof other !== 'string' || !other || other.includes('/') || other === uid) {
      throw new ApiFailure('not_found', 'No such invite.');
    }
    const pair = pairOf(uid, other);
    const status = snap.get('status');
    if (status === 'accepted') return { connectionId: pair, notificationId: null };
    if (status !== 'pending') throw new ApiFailure('conflict', 'This invite is no longer open.');

    const connection = db.doc(`connections/${pair}`);
    const [me, blockOut, blockIn, existing] = await Promise.all([
      tx.get(db.doc(`users/${uid}`)),
      tx.get(db.doc(`users/${uid}/blocks/${other}`)),
      tx.get(db.doc(`users/${other}/blocks/${uid}`)),
      tx.get(connection),
    ]);
    // One answer for both directions: the recipient must not learn they were blocked.
    if (blockOut.exists || blockIn.exists) throw new ApiFailure('blocked', 'You cannot connect with this person.');
    if (!hasPenName(me)) throw noPenName();

    tx.update(ref, { status: 'accepted' });
    if (!existing.exists) {
      tx.set(connection, { userIds: [uid, other].sort(), establishedAt: FieldValue.serverTimestamp(), inviteId });
    }
    const bell = db.collection('notifications').doc();
    tx.set(bell, {
      userId: other,
      type: 'invite_accepted',
      payload: { inviteId, fromUserId: uid, fromHandle: String(me.get('handle') ?? '') },
      readAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { connectionId: pair, notificationId: bell.id };
  });
}
