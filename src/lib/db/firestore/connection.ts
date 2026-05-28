import type { IConnectionRepository } from '../interfaces';
import type { Connection, User } from '../types';
import { getAdminDb } from './admin';
import { mapConnection, mapUser } from './mapper';

function connectionId(a: string, b: string) {
  return [a, b].sort().join('_');
}

export class FirestoreConnectionRepository implements IConnectionRepository {
  private collection() {
    return getAdminDb().collection('connections');
  }

  async isConnected(a: string, b: string): Promise<boolean> {
    const snap = await this.collection().doc(connectionId(a, b)).get();
    return snap.exists;
  }

  async list(userId: string): Promise<Connection[]> {
    const snap = await this.collection().where('userIds', 'array-contains', userId).get();
    return snap.docs.map((doc) => mapConnection(doc.id, doc.data()));
  }

  async listMutuals(userId: string): Promise<User[]> {
    const connections = await this.list(userId);
    const ids = connections.map((conn) =>
      conn.userIds[0] === userId ? conn.userIds[1] : conn.userIds[0]
    );
    const users = await Promise.all(ids.map((id) => getAdminDb().collection('users').doc(id).get()));
    return users
      .filter((doc) => doc.exists)
      .map((doc) => mapUser(doc.id, doc.data() ?? {}));
  }

  async sever(a: string, b: string): Promise<void> {
    await this.collection().doc(connectionId(a, b)).delete();
  }
}
