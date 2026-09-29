import { beforeEach, describe, expect, it, vi } from 'vitest';

// Answering a legacy invite: accepting one from someone you're already
// connected with (a resonance or a note did it since) keeps that connection
// instead of rewriting it — which the rules refuse — and declining is the
// recipient's own act, not the sender's withdrawal.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('./profile', () => ({ getCurrentUserHandle: vi.fn(async () => 'alice') }));
vi.mock('./push', () => ({ ringNotification: vi.fn() }));
const isConnected = vi.fn(async (_a: string, _b: string) => false);
vi.mock('./reads', () => ({ isConnected: (a: string, b: string) => isConnected(a, b) }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'alice' } })),
}));

let invite: Record<string, unknown> = {};
const tx = {
  get: vi.fn(async () => ({ exists: () => true, data: () => invite })),
  set: vi.fn(),
  update: vi.fn(),
};
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((parent: { name?: string }, ...path: string[]) => (path.length ? { path: path.join('/') } : { id: `${parent.name}-new` })),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  Timestamp: class {},
  where: vi.fn(),
}));

import { acceptInvite, declineInvite } from './invites';

const writes = () => [
  ...tx.set.mock.calls.map(([ref, data]) => ({ op: 'set', path: (ref as { path?: string }).path, data })),
  ...tx.update.mock.calls.map(([ref, data]) => ({ op: 'update', path: (ref as { path: string }).path, data })),
];

beforeEach(() => {
  vi.clearAllMocks();
  invite = { fromUserId: 'bob', toUserId: 'alice', status: 'pending' };
});

describe('acceptInvite', () => {
  it('connects the two and tells the sender', async () => {
    expect(await acceptInvite('i1')).toBe('alice_bob');
    expect(writes()).toEqual(expect.arrayContaining([
      { op: 'update', path: 'invites/i1', data: { status: 'accepted' } },
      { op: 'set', path: 'connections/alice_bob', data: expect.objectContaining({ userIds: ['alice', 'bob'] }) },
      { op: 'set', path: undefined, data: expect.objectContaining({ type: 'invite_accepted', userId: 'bob' }) },
    ]));
  });

  it('keeps an existing connection as it is', async () => {
    isConnected.mockResolvedValueOnce(true);
    await acceptInvite('i1');
    expect(isConnected).toHaveBeenCalledWith('alice', 'bob');
    expect(writes().map((w) => w.path)).not.toContain('connections/alice_bob');
    expect(writes()).toContainEqual({ op: 'update', path: 'invites/i1', data: { status: 'accepted' } });
  });
});

describe('declineInvite', () => {
  it("closes the recipient's invite as declined, with no connection and no bell", async () => {
    await declineInvite('i1');
    expect(writes()).toEqual([{ op: 'update', path: 'invites/i1', data: { status: 'declined' } }]);
  });

  it("refuses someone else's invite and one that's no longer pending", async () => {
    invite = { fromUserId: 'bob', toUserId: 'carol', status: 'pending' };
    await expect(declineInvite('i1')).rejects.toThrow('Only the recipient can decline');
    invite = { fromUserId: 'bob', toUserId: 'alice', status: 'withdrawn' };
    await expect(declineInvite('i1')).rejects.toThrow('Invite no longer pending');
    expect(writes()).toEqual([]);
  });
});
