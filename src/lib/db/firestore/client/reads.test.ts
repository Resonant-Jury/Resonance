import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// These pure functions wrap a single Firestore `getDoc`. We mock the SDK and
// the db/auth accessors so the tests exercise *our* error handling, not the
// network. Only the named exports the code under test actually calls need real
// behaviour; the rest are inert stubs so the module imports cleanly.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => ({ currentUser: { uid: 'me' } })),
}));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, name: string) => name),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  documentId: vi.fn(() => '__name__'),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn((n: number) => ({ limit: n })),
  orderBy: vi.fn(),
  // A query is its collection plus its filters, so tests can see what was asked.
  query: vi.fn((collection: string, ...filters: unknown[]) => ({ collection, filters })),
  startAfter: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  // A class, so the mapper's `instanceof Timestamp` checks run.
  Timestamp: class {
    static fromDate = vi.fn();
  },
}));

import { getDoc, getDocs } from 'firebase/firestore/lite';
import {
  forgetCachedUser,
  getCurrentUserProfile,
  getLatestPublishedFeed,
  getPublicCardsByAuthor,
  getResonanceCards,
  getUserByHandle,
  getUserById,
  getUsersByIds,
  isConnected,
} from './reads';

const denied = () => new Error('Missing or insufficient permissions');

describe('isConnected', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns true when the connection doc exists', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => true } as never);
    await expect(isConnected('a', 'b')).resolves.toBe(true);
  });

  it('returns false when the connection doc is absent', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(isConnected('a', 'b')).resolves.toBe(false);
  });

  // Regression: the connections read rule references `resource.data.userIds`, so
  // a `get` on a doc that doesn't exist (the common "not connected" case) is
  // *denied* rather than returning an empty snapshot. The function must swallow
  // that and report "not connected" — otherwise the whole profile fetch throws
  // and the page falls through to its not-found state.
  it('swallows a permission-denied error and reports not connected', async () => {
    vi.mocked(getDoc).mockRejectedValue(denied());
    await expect(isConnected('a', 'b')).resolves.toBe(false);
  });
});

// --- profiles: one page-wide cache, batched reads -----------------------------

/** What Firestore holds under users/*: every uid but the ones listed as missing. */
function usersQueryAnswer(missing: string[] = []) {
  vi.mocked(getDocs).mockImplementation((async (q: { filters: { value: string[] }[] }) => {
    const ids = q.filters[0].value.filter((id) => !missing.includes(id));
    return { docs: ids.map((id) => ({ id, data: () => ({ handle: `h-${id}` }) })) };
  }) as never);
}
/** The uids each `documentId() in` query asked for, in order. */
const inQueries = () =>
  vi.mocked(getDocs).mock.calls.map(([q]) => {
    const f = (q as unknown as { filters: { field: string; op: string; value: string[] }[] }).filters[0];
    expect(f).toMatchObject({ field: '__name__', op: 'in' });
    return f.value;
  });

describe('profiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetCachedUser();
  });

  it('reads a list\'s authors together, at most 30 per query, not one read each', async () => {
    usersQueryAnswer();
    const ids = Array.from({ length: 35 }, (_, i) => `u${i}`);
    const authors = await getUsersByIds([...ids, 'u0', 'u1']);

    expect(Object.keys(authors)).toHaveLength(35);
    expect(authors.u34.handle).toBe('h-u34');
    const asked = inQueries();
    expect(asked.map((chunk) => chunk.length)).toEqual([30, 5]);
    // Each query says how many it reads: the rules list profiles a page (≤ 30) at a time.
    const limits = vi.mocked(getDocs).mock.calls.map(([q]) => (q as unknown as { filters: unknown[] }).filters[1]);
    expect(limits).toEqual([{ limit: 30 }, { limit: 5 }]);
    expect(asked.flat().sort()).toEqual([...ids].sort());
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('serves the next list from the cache, reading only the people it has not seen', async () => {
    usersQueryAnswer();
    await getUsersByIds(['a', 'b']);
    vi.mocked(getDocs).mockClear();

    const authors = await getUsersByIds(['a', 'b', 'c']);
    expect(Object.keys(authors).sort()).toEqual(['a', 'b', 'c']);
    expect(inQueries()).toEqual([['c']]);

    // A single profile read (a card page's author) is a cache hit too.
    await expect(getUserById('a')).resolves.toMatchObject({ handle: 'h-a' });
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('shares a read already on its way instead of starting another', async () => {
    usersQueryAnswer();
    const [first, second] = await Promise.all([getUsersByIds(['a', 'b']), getUsersByIds(['b', 'a'])]);
    expect(first.a.handle).toBe('h-a');
    expect(second.b.handle).toBe('h-b');
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('remembers who is missing, and leaves them out', async () => {
    usersQueryAnswer(['gone']);
    expect(await getUsersByIds(['a', 'gone'])).not.toHaveProperty('gone');
    vi.mocked(getDocs).mockClear();
    expect(await getUsersByIds(['gone'])).toEqual({});
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('reads a profile again once it is a few minutes old', async () => {
    usersQueryAnswer();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    await getUsersByIds(['a']);
    now.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    vi.mocked(getDocs).mockClear();
    await getUsersByIds(['a']);
    expect(inQueries()).toEqual([['a']]);
    now.mockRestore();
  });

  it("always reads the viewer's own profile fresh, and forgets a profile its owner just edited", async () => {
    usersQueryAnswer();
    await getUsersByIds(['me']);
    vi.mocked(getDoc).mockResolvedValue({ id: 'me', exists: () => true, data: () => ({ handle: 'renamed' }) } as never);

    await expect(getCurrentUserProfile()).resolves.toMatchObject({ handle: 'renamed' });
    // …and the lists pick up what it read.
    vi.mocked(getDocs).mockClear();
    expect((await getUsersByIds(['me'])).me.handle).toBe('renamed');
    expect(getDocs).not.toHaveBeenCalled();

    forgetCachedUser('me');
    await getUsersByIds(['me']);
    expect(inQueries()).toEqual([['me']]);
  });

  it('lets a failed read fail, and caches nothing from it', async () => {
    vi.mocked(getDocs).mockRejectedValueOnce(new Error('offline'));
    await expect(getUsersByIds(['a'])).rejects.toThrow('offline');
    usersQueryAnswer();
    expect((await getUsersByIds(['a'])).a.handle).toBe('h-a');
  });
});

// An anonymous card's document names its author, so the rules list only
// public cards that name theirs: every public list must ask for exactly that
// (the server hands anonymous ones out, without their author).
describe('public card lists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getDocs).mockResolvedValue({ docs: [] } as never);
  });
  const filtersOf = (call: number) => (vi.mocked(getDocs).mock.calls[call][0] as unknown as { filters: unknown[] }).filters;

  it('ask only for attributed cards: the latest feed, a card\'s resonances, a profile\'s cards', async () => {
    await getLatestPublishedFeed(12);
    await getResonanceCards('c1');
    await getPublicCardsByAuthor('bob');
    for (const call of [0, 1, 2]) {
      expect(filtersOf(call)).toContainEqual({ field: 'anonymous', op: '==', value: false });
      expect(filtersOf(call)).toContainEqual({ field: 'visibility', op: '==', value: 'public' });
    }
  });
});

describe('getUserByHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    forgetCachedUser();
  });

  it("goes by the pen name's reservation (handles/{name}), then the profile it names", async () => {
    vi.mocked(getDoc).mockImplementation((async (ref: { path: string }) =>
      ref.path === 'handles/小夜'
        ? { exists: () => true, data: () => ({ uid: 'nina', handle: '小夜' }) }
        : { id: 'nina', exists: () => true, data: () => ({ handle: '小夜' }) }) as never);
    await expect(getUserByHandle(' 小夜 ')).resolves.toMatchObject({ id: 'nina', handle: '小夜' });
    expect(vi.mocked(getDoc).mock.calls.map(([ref]) => (ref as unknown as { path: string }).path)).toEqual(['handles/小夜', 'users/nina']);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('falls back to the profiles themselves for a name not reserved yet (one at most)', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    vi.mocked(getDocs).mockResolvedValue({ docs: [{ id: 'bob', data: () => ({ handle: 'Bob' }) }] } as never);
    await expect(getUserByHandle('BOB')).resolves.toMatchObject({ id: 'bob' });
    const q = vi.mocked(getDocs).mock.calls[0][0] as unknown as { filters: unknown[] };
    expect(q.filters).toEqual([{ field: 'handleLower', op: '==', value: 'bob' }, { limit: 1 }]);
  });
});
