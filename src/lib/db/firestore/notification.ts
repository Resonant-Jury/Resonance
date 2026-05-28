import type { INotificationRepository } from '../interfaces';
import type { Notification } from '../types';
import { getAdminDb } from './admin';
import { mapNotification } from './mapper';

export class FirestoreNotificationRepository implements INotificationRepository {
  private collection() {
    return getAdminDb().collection('notifications');
  }

  async list(userId: string, limit = 20): Promise<Notification[]> {
    const snap = await this.collection()
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => mapNotification(doc.id, doc.data()));
  }

  async unreadCount(userId: string): Promise<number> {
    const snap = await this.collection()
      .where('userId', '==', userId)
      .where('readAt', '==', null)
      .count()
      .get();
    return snap.data().count;
  }

  async markRead(id: string): Promise<void> {
    await this.collection().doc(id).set({ readAt: new Date() }, { merge: true });
  }
}
