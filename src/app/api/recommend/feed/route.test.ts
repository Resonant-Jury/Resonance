import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/recommend/feed (the web's recommended feed) around the daily
// recommendations (lib/recommend/daily): what reaches the browser of them.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const dailyRecommendations = vi.fn();
vi.mock('@/lib/recommend/daily', () => ({ dailyRecommendations: (...a: unknown[]) => dailyRecommendations(...a) }));
vi.mock('next/server', async (importOriginal) => ({ ...(await importOriginal<typeof import('next/server')>()), after: vi.fn() }));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('GET /api/recommend/feed', () => {
  // Review: the ranking's score went out as it was, and only the boost for an
  // author the reader had answered could lift one past 1 — naming whose card
  // an anonymous one was.
  it('answers each pick by its card and reason, never its score or channel', async () => {
    dailyRecommendations.mockResolvedValue({
      items: [
        { cardId: 'c1', channel: 'insight', reason: '因為你也走過', score: 1.15 },
        { cardId: 'c2', channel: 'situation', reason: '', score: 0.4 },
      ],
      cached: true,
      status: 'fresh',
      refresh: null,
    });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      items: [
        { cardId: 'c1', reason: '因為你也走過' },
        { cardId: 'c2', reason: '' },
      ],
      cached: true,
      status: 'fresh',
    });
  });

  it('is 401 signed out', async () => {
    getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(dailyRecommendations).not.toHaveBeenCalled();
  });
});
