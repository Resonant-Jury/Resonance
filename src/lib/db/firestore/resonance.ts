import { FieldValue } from 'firebase-admin/firestore';
import type { IResonanceRepository } from '../interfaces';
import type { Card } from '../types';
import { getAdminDb } from './admin';
import { mapCard } from './mapper';

function resonanceId(cardId: string, userId: string) {
  return `${cardId}_${userId}`;
}

export class FirestoreResonanceRepository implements IResonanceRepository {
  private collection() {
    return getAdminDb().collection('resonances');
  }

  async mark(cardId: string, userId: string, note?: string): Promise<void> {
    const db = getAdminDb();
    const id = resonanceId(cardId, userId);
    await db.runTransaction(async (tx) => {
      const ref = this.collection().doc(id);
      const snap = await tx.get(ref);
      tx.set(
        ref,
        {
          cardId,
          userId,
          note: note ?? null,
          createdAt: snap.exists ? snap.data()?.createdAt : FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      if (!snap.exists) {
        tx.set(
          db.collection('cards').doc(cardId),
          { resonanceCount: FieldValue.increment(1) },
          { merge: true }
        );
      }
    });
  }

  async unmark(cardId: string, userId: string): Promise<void> {
    const db = getAdminDb();
    const id = resonanceId(cardId, userId);
    await db.runTransaction(async (tx) => {
      const ref = this.collection().doc(id);
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      tx.delete(ref);
      tx.set(
        db.collection('cards').doc(cardId),
        { resonanceCount: FieldValue.increment(-1) },
        { merge: true }
      );
    });
  }

  async hasResonated(cardId: string, userId: string): Promise<boolean> {
    const snap = await this.collection().doc(resonanceId(cardId, userId)).get();
    return snap.exists;
  }

  async listResonated(userId: string): Promise<Card[]> {
    const snap = await this.collection()
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    const cards = await Promise.all(
      snap.docs.map((doc) => getAdminDb().collection('cards').doc(String(doc.data().cardId)).get())
    );
    return cards
      .filter((doc) => doc.exists)
      .map((doc) => mapCard(doc.id, doc.data() ?? {}));
  }
}
