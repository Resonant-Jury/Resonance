import { getCurrentUser } from '@/lib/auth';
import type { IUserRepository } from '../interfaces';
import type { User } from '../types';
import { getAdminDb } from './admin';
import { mapUser } from './mapper';

function normalizeHandle(handle: string) {
  return handle.trim().toLowerCase();
}

export class FirestoreUserRepository implements IUserRepository {
  private collection() {
    return getAdminDb().collection('users');
  }

  async findById(id: string): Promise<User | null> {
    const snap = await this.collection().doc(id).get();
    return snap.exists ? mapUser(snap.id, snap.data() ?? {}) : null;
  }

  async findByHandle(handle: string): Promise<User | null> {
    const snap = await this.collection()
      .where('handleLower', '==', normalizeHandle(handle))
      .limit(1)
      .get();
    const doc = snap.docs[0];
    return doc ? mapUser(doc.id, doc.data()) : null;
  }

  async getCurrent(): Promise<User | null> {
    const authUser = await getCurrentUser();
    return authUser ? this.findById(authUser.id) : null;
  }

  async updateCurrent(patch: Partial<User>): Promise<User> {
    const authUser = await getCurrentUser();
    if (!authUser) throw new Error('Authentication required');
    const cleanPatch: Partial<User> & { handleLower?: string } = { ...patch };
    if (patch.handle) cleanPatch.handleLower = normalizeHandle(patch.handle);
    await this.collection().doc(authUser.id).set(cleanPatch, { merge: true });
    const next = await this.findById(authUser.id);
    if (!next) throw new Error('User profile not found');
    return next;
  }

  async isHandleAvailable(handle: string): Promise<boolean> {
    const authUser = await getCurrentUser();
    const existing = await this.findByHandle(handle);
    return !existing || existing.id === authUser?.id;
  }
}
