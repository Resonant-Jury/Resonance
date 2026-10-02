import { getCurrentUser } from '@/lib/auth';
import type { IUserRepository } from '../interfaces';
import type { User } from '../types';
import { getAdminDb } from './admin';
import { uidForHandle } from './handles';
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

  /** The person who goes by a pen name, through its reservation (./handles). */
  async findByHandle(handle: string): Promise<User | null> {
    const uid = await uidForHandle(getAdminDb(), normalizeHandle(handle));
    return uid ? this.findById(uid) : null;
  }

  async getCurrent(): Promise<User | null> {
    const authUser = await getCurrentUser();
    return authUser ? this.findById(authUser.id) : null;
  }

  /**
   * Profile fields that name no one else. A pen name (and the badge) only
   * ever changes through lib/api/v1/profile, which keeps its reservation.
   */
  async updateCurrent(patch: Partial<User>): Promise<User> {
    const authUser = await getCurrentUser();
    if (!authUser) throw new Error('Authentication required');
    if ('handle' in patch || 'verified' in patch) throw new Error('A pen name changes through PATCH /api/v1/me');
    await this.collection().doc(authUser.id).set({ ...patch }, { merge: true });
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
