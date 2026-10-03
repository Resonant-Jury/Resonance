import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Answering a legacy invite: accepting goes through the server
// (POST /api/v1/invites/{id}/accept), which connects the two and rings the
// sender — the browser writes neither (the rules refuse both) — and
// declining is the recipient's own act, not the sender's withdrawal.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
const mockAuth = {
  currentUser: { uid: 'alice', getIdToken: async () => 'id-token' } as { uid: string; getIdToken: () => Promise<string> } | null,
};
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: vi.fn(() => mockAuth) }));

// The Lite SDK's Timestamp, as far as the inbox reads it.
const { FakeTimestamp } = vi.hoisted(() => ({
  FakeTimestamp: class {
    constructor(readonly ms: number) {}
    toDate() {
      return new Date(this.ms);
    }
  },
}));

let invite: Record<string, unknown> = {};
const tx = {
  get: vi.fn(async () => ({ exists: () => true, data: () => invite })),
  set: vi.fn(),
  update: vi.fn(),
};
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ name })),
  doc: vi.fn((parent: { name?: string }, ...path: string[]) => (path.length ? { path: path.join('/') } : { id: `${parent.name}-new` })),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(async (_db: unknown, fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  Timestamp: FakeTimestamp,
  where: vi.fn(),
}));

import { getDocs } from 'firebase/firestore/lite';
import { acceptInvite, declineInvite, listIncomingPendingInvites } from './invites';

const writes = () => [
  ...tx.set.mock.calls.map(([ref, data]) => ({ op: 'set', path: (ref as { path?: string }).path, data })),
  ...tx.update.mock.calls.map(([ref, data]) => ({ op: 'update', path: (ref as { path: string }).path, data })),
];

const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ connectionId: 'alice_bob' }), { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.currentUser = { uid: 'alice', getIdToken: async () => 'id-token' };
  invite = { fromUserId: 'bob', toUserId: 'alice', status: 'pending' };
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('acceptInvite', () => {
  it('asks the server to accept it, signed in with the ID token, and answers the connection', async () => {
    expect(await acceptInvite('i/1')).toBe('alice_bob');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/invites/i%2F1/accept');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer id-token');
    // No connection, bell or invite write from the browser.
    expect(writes()).toEqual([]);
  });

  it("surfaces the server's refusal (a block, an invite no longer open)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { code: 'conflict', message: 'This invite is no longer open.' } }), { status: 409 }),
    );
    await expect(acceptInvite('i1')).rejects.toMatchObject({ status: 409, code: 'conflict', message: 'This invite is no longer open.' });
  });

  it('never calls out when signed out', async () => {
    mockAuth.currentUser = null;
    await expect(acceptInvite('i1')).rejects.toThrow('Not signed in');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('declineInvite', () => {
  it("closes the recipient's invite as declined, with no connection and no bell", async () => {
    await declineInvite('i1');
    expect(writes()).toEqual([{ op: 'update', path: 'invites/i1', data: { status: 'declined' } }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses someone else's invite and one that's no longer pending", async () => {
    invite = { fromUserId: 'bob', toUserId: 'carol', status: 'pending' };
    await expect(declineInvite('i1')).rejects.toThrow('Only the recipient can decline');
    invite = { fromUserId: 'bob', toUserId: 'alice', status: 'withdrawn' };
    await expect(declineInvite('i1')).rejects.toThrow('Invite no longer pending');
    expect(writes()).toEqual([]);
  });
});

describe('listIncomingPendingInvites', () => {
  const at = (iso: string) => new FakeTimestamp(Date.parse(iso));
  const row = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => ({ fromUserId: 'bob', toUserId: 'alice', message: id, status: 'pending', createdAt: at('2026-09-29T10:00:00Z'), ...data }),
  });

  // An invite past its "respond by" date is still `pending` until someone
  // taps Accept (the server then refuses it and closes it as expired): the
  // inbox must not offer a button that can only fail.
  it('offers only the pending invites still before their "respond by" date', async () => {
    vi.mocked(getDocs).mockResolvedValueOnce({
      docs: [
        row('open', { expiresAt: at('2026-10-07T00:00:00Z') }),
        row('expired', { expiresAt: at('2026-10-03T00:00:00Z') }),
        row('undated', {}),
        row('this-moment', { expiresAt: at('2026-10-04T12:00:00Z') }),
      ],
    } as never);
    const listed = await listIncomingPendingInvites(new Date('2026-10-04T12:00:00Z'));
    expect(listed.map((i) => i.id)).toEqual(['open']);
    expect(listed[0]).toMatchObject({ fromUserId: 'bob', status: 'pending', expiresAt: new Date('2026-10-07T00:00:00Z') });
  });

  it('asks for nothing signed out', async () => {
    mockAuth.currentUser = null;
    expect(await listIncomingPendingInvites()).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });
});
