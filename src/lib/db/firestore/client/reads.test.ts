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
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
}));

import { getDoc } from 'firebase/firestore';
import { isConnected } from './reads';

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
