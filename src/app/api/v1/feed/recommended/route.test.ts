import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/feed/recommended around the daily recommendations: what it runs
// after its response (the cards themselves: test/emulator/apiV1Recommended).

vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => ({ id: 'alice' }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const dailyRecommendations = vi.fn();
vi.mock('@/lib/recommend/daily', () => ({ dailyRecommendations: (...a: unknown[]) => dailyRecommendations(...a) }));
vi.mock('@/lib/api/v1/reads', () => ({
  getRecommendedFeed: async (db: unknown, uid: string, load: (db: unknown, uid: string) => Promise<{ status: string }>) => {
    const { status } = await load(db, uid);
    return { cards: [], status };
  },
}));
const after = vi.fn();
vi.mock('next/server', async (orig) => ({ ...(await orig<typeof import('next/server')>()), after: (fn: unknown) => after(fn) }));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/v1/feed/recommended', () => {
  // The evening's pick push leaves a reader who opened their picks today be.
  it("puts the reader's ask on record after the response, beside today's build when one is due", async () => {
    const refresh = vi.fn();
    const asked = vi.fn();
    dailyRecommendations.mockResolvedValue({ items: [], cached: true, status: 'stale', refresh, asked });
    const res = await GET(new Request('http://localhost/api/v1/feed/recommended'));
    expect(res.status).toBe(200);
    expect(after.mock.calls.map(([fn]) => fn)).toEqual(expect.arrayContaining([refresh, asked]));

    after.mockClear();
    dailyRecommendations.mockResolvedValue({ items: [], cached: true, status: 'fresh', refresh: null, asked: null });
    await GET(new Request('http://localhost/api/v1/feed/recommended'));
    expect(after.mock.calls.map(([fn]) => fn)).not.toContain(null);
    expect(after.mock.calls.map(([fn]) => fn)).not.toContain(asked);
  });
});
