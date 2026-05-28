import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { IInviteRepository } from '../interfaces';
import type { Connection, Invite, NewInvite } from '../types';
import { ForbiddenError, NotFoundError, QuotaExceededError } from '../errors';
import { getAdminDb } from './admin';
import { mapConnection, mapInvite } from './mapper';

const DAILY_QUOTA = 3;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function connectionId(a: string, b: string) {
  return [a, b].sort().join('_');
}

export class FirestoreInviteRepository implements IInviteRepository {
  private collection() {
    return getAdminDb().collection('invites');
  }

  async send(input: NewInvite): Promise<Invite> {
    const remaining = await this.remainingDailyQuota(input.fromUserId);
    if (remaining <= 0) throw new QuotaExceededError('Daily invite quota exceeded');
    const doc = await this.collection().add({
      ...input,
      status: 'pending',
      expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 86_400_000)),
      createdAt: FieldValue.serverTimestamp(),
    });
    const snap = await doc.get();
    return mapInvite(snap.id, snap.data() ?? {});
  }

  async accept(id: string, userId: string): Promise<Connection> {
    const db = getAdminDb();
    const inviteRef = this.collection().doc(id);
    return db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      if (!inviteSnap.exists) throw new NotFoundError(`Invite ${id} not found`);
      const invite = mapInvite(inviteSnap.id, inviteSnap.data() ?? {});
      if (invite.toUserId !== userId) throw new ForbiddenError('Not invite recipient');
      const connRef = db.collection('connections').doc(connectionId(invite.fromUserId, invite.toUserId));
      tx.set(inviteRef, { status: 'accepted' }, { merge: true });
      tx.set(
        connRef,
        {
          userIds: [invite.fromUserId, invite.toUserId].sort(),
          establishedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return {
        id: connRef.id,
        userIds: [invite.fromUserId, invite.toUserId].sort() as [string, string],
        establishedAt: new Date(),
      };
    });
  }

  async expire(id: string): Promise<void> {
    await this.collection().doc(id).set({ status: 'expired' }, { merge: true });
  }

  async withdraw(id: string, userId: string): Promise<void> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return;
    const invite = mapInvite(snap.id, snap.data() ?? {});
    if (invite.fromUserId !== userId) throw new ForbiddenError();
    await snap.ref.set({ status: 'withdrawn' }, { merge: true });
  }

  async listPending(userId: string): Promise<Invite[]> {
    const snap = await this.collection()
      .where('toUserId', '==', userId)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map((doc) => mapInvite(doc.id, doc.data()));
  }

  async remainingDailyQuota(userId: string): Promise<number> {
    const snap = await this.collection()
      .where('fromUserId', '==', userId)
      .where('createdAt', '>=', Timestamp.fromDate(startOfToday()))
      .get();
    return Math.max(0, DAILY_QUOTA - snap.size);
  }
}
