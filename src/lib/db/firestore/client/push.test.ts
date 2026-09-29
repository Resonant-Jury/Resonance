import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The bell rows the web still writes from the browser ask the server to push
// them — each writer rings exactly the row it wrote, after its write landed,
// and never when the write failed or there was no row.
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

import { setDoc } from 'firebase/firestore';
import { notifyResonance } from './resonances';
import { notifyConversationStarted } from './messages';
import { acceptInvite } from './invites';
import { createCardLink } from './cardLinks';

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status: 202 }));
const rung = () => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => {
  nextId = 0;
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('web bell rows ring their push', () => {
  it('a resonance published from the web', async () => {
    await notifyResonance('orig', { authorId: 'bob', fromHandle: 'alice' });
    const [row] = batch.set.mock.calls[0] as unknown as [{ id: string }];
    expect(rung()).toEqual([`/api/notifications/${row.id}/push`]);
  });

  it("but not the author's resonance to their own card, which writes no row", async () => {
    await notifyResonance('orig', { authorId: 'alice', fromHandle: 'alice' });
    expect(rung()).toEqual([]);
  });

  it("a conversation's first message", async () => {
    await notifyConversationStarted('bob', 'alice');
    const [row] = vi.mocked(setDoc).mock.calls[0] as unknown as [{ id: string }];
    expect(rung()).toEqual([`/api/notifications/${row.id}/push`]);
  });

  it('an accepted invite — only once the transaction committed', async () => {
    await acceptInvite('i1');
    const row = tx.set.mock.calls.find(([, v]) => (v as { type?: string }).type === 'invite_accepted')![0] as { id: string };
    expect(rung()).toEqual([`/api/notifications/${row.id}/push`]);

    tx.get.mockResolvedValueOnce({ exists: () => false, data: () => ({}) } as never);
    fetchMock.mockClear();
    await expect(acceptInvite('gone')).rejects.toThrow();
    expect(rung()).toEqual([]);
  });

  it("a card link to someone else's card, never to your own", async () => {
    await createCardLink({ sourceCardId: 'mine', targetCardId: 'theirs', targetAuthorId: 'bob', fromHandle: 'alice' });
    const row = batch.set.mock.calls.map(([ref]) => ref as { id: string }).find((r) => r.id.startsWith('notifications-'))!;
    expect(rung()).toEqual([`/api/notifications/${row.id}/push`]);

    fetchMock.mockClear();
    await createCardLink({ sourceCardId: 'mine', targetCardId: 'also-mine', targetAuthorId: 'alice', fromHandle: 'alice' });
    expect(rung()).toEqual([]);
  });
});
