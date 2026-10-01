import { beforeEach, describe, expect, it, vi } from 'vitest';

// Auth as the browser has it on a first load: no user until the SDK has
// restored the returning reader from its persistence, which settles
// `authStateReady()`.
const auth = vi.hoisted(() => {
  let restore: () => void = () => {};
  const state = {
    currentUser: null as { uid: string } | null,
    ready: Promise.resolve(),
    authStateReady: () => state.ready,
    /** Start a page load whose returning reader is `uid`, restored once `restore()` runs. */
    reload(uid: string) {
      state.currentUser = null;
      state.ready = new Promise<void>((resolve) => {
        restore = () => {
          state.currentUser = { uid };
          resolve();
        };
      });
    },
    restore: () => restore(),
  };
  return state;
});

vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));
vi.mock('./reads', () => ({ isConnected: vi.fn() }));
vi.mock('@/lib/auth/firebase/client', () => ({ getFirebaseClientAuth: () => auth }));
vi.mock('firebase/firestore/lite', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: class {},
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

import { getDocs } from 'firebase/firestore/lite';
import { getMyBlockedIds, invalidateBlocks } from './blocks';

beforeEach(() => {
  vi.clearAllMocks();
  invalidateBlocks();
  vi.mocked(getDocs).mockImplementation(
    (async (path: string) => ({ docs: path === 'users/me/blocks' ? [{ id: 'blocked-author' }] : [] })) as never,
  );
});

describe('getMyBlockedIds', () => {
  // A list that doesn't wait for the viewer (the home feed) asks for the block
  // list as soon as the page loads. Answering "nobody" before Auth restored the
  // reader let a blocked author's cards through, and the list was cached so.
  it("waits for Auth to restore a returning reader before reading their list", async () => {
    auth.reload('me');
    const list = getMyBlockedIds();
    await Promise.resolve();
    expect(getDocs).not.toHaveBeenCalled();
    auth.restore();
    await expect(list).resolves.toEqual(new Set(['blocked-author']));
    expect(getDocs).toHaveBeenCalledWith('users/me/blocks');
  });

  it('is empty for a signed-out reader once Auth has settled', async () => {
    auth.currentUser = null;
    auth.ready = Promise.resolve();
    await expect(getMyBlockedIds()).resolves.toEqual(new Set());
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('reads the list once for every list that asks for it', async () => {
    auth.reload('me');
    const lists = [getMyBlockedIds(), getMyBlockedIds()];
    auth.restore();
    await Promise.all(lists);
    await getMyBlockedIds();
    expect(getDocs).toHaveBeenCalledTimes(1);
  });
});
