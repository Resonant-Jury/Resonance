import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The one bell row the web still writes from the browser (a legacy invite's
// "accepted") asks the server to push it — exactly the row it wrote, after its
// write landed, and never when the write failed. Every other bell is written
// and pushed by the server.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('./profile', () => ({ getCurrentUserHandle: vi.fn(async () => 'alice') }));
vi.mock('./reads', () => ({ isConnected: vi.fn(async () => false) }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'alice' } })),
}));

let nextId = 0;
const batch = { set: vi.fn(), commit: vi.fn(async () => {}) };
const tx = {
  get: vi.fn(async () => ({ exists: () => true, data: () => ({ toUserId: 'alice', fromUserId: 'bob', status: 'pending' }) })),
  set: vi.fn(),
  update: vi.fn(),
};
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((parent: { name?: string }, ...path: string[]) =>
    path.length ? { id: path[path.length - 1], path: path.join('/') } : { id: `${parent.name}-${++nextId}` }),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  setDoc: vi.fn(async () => {}),
  Timestamp: class {},
  where: vi.fn(),
  writeBatch: vi.fn(() => batch),
  // messages.ts
  getDoc: vi.fn(),
  increment: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(),
}));

import { acceptInvite } from './invites';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 202 }));
const rung = () => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  nextId = 0;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('the web bell row rings its push', () => {
  it('an accepted invite — only once the transaction committed', async () => {
    await acceptInvite('i1');
    const row = tx.set.mock.calls.find(([, v]) => (v as { type?: string }).type === 'invite_accepted')![0] as { id: string };
    expect(rung()).toEqual([`/api/notifications/${row.id}/push`]);

    tx.get.mockResolvedValueOnce({ exists: () => false, data: () => ({}) } as never);
    fetchMock.mockClear();
    await expect(acceptInvite('gone')).rejects.toThrow();
    expect(rung()).toEqual([]);
  });

  it('connects the two people by naming the invite it accepts', async () => {
    await acceptInvite('i1');
    const connection = tx.set.mock.calls.find(([ref]) => (ref as { path?: string }).path?.startsWith('connections/'));
    expect(connection?.[1]).toMatchObject({ userIds: ['alice', 'bob'], inviteId: 'i1' });
  });
});
