import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Firebase boundary mocks ------------------------------------------------
// `remainingDailyQuota` wraps a single Firestore `getDoc` on today's quota doc.
// We mock the SDK plus the db/auth accessors so the tests exercise our quota
// math and error handling without the network.
vi.mock('./init', () => ({ getClientDb: vi.fn(() => ({})) }));

const mockAuth = { currentUser: { uid: 'me' } as { uid: string } | null };
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: vi.fn(() => mockAuth),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  Timestamp: { fromDate: vi.fn() },
  where: vi.fn(),
}));

import { getDoc } from 'firebase/firestore';
import { remainingDailyQuota } from './invites';

const DAILY_LIMIT = 3;

describe('remainingDailyQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { uid: 'me' };
  });

  it('returns 0 when no one is signed in', async () => {
    mockAuth.currentUser = null;
    await expect(remainingDailyQuota()).resolves.toBe(0);
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('subtracts today’s used invites from the daily limit', async () => {
    vi.mocked(getDoc).mockResolvedValue({
      exists: () => true,
      data: () => ({ inviteCount: 2 }),
    } as never);
    await expect(remainingDailyQuota()).resolves.toBe(DAILY_LIMIT - 2);
  });

  it('reports the full quota when today’s doc does not exist yet', async () => {
    vi.mocked(getDoc).mockResolvedValue({ exists: () => false } as never);
    await expect(remainingDailyQuota()).resolves.toBe(DAILY_LIMIT);
  });

  // Regression: the quota read rule references `resource.data.userId`, so a `get`
  // on today's doc before any invite is sent (it doesn't exist) is *denied*
  // rather than returning an empty snapshot. The function must treat that as
  // "no invites used yet" and report the full quota — otherwise viewing another
  // person's profile throws and renders the not-found state.
  it('swallows a permission-denied error and reports the full quota', async () => {
    vi.mocked(getDoc).mockRejectedValue(new Error('Missing or insufficient permissions'));
    await expect(remainingDailyQuota()).resolves.toBe(DAILY_LIMIT);
  });
});
