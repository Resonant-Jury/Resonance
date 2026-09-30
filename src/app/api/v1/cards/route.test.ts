import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/cards?keys= reads what it is asked for, within bounds: every
// key must be able to name a card (never a path), and at most 30 at once.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const getCardsByKeys = vi.fn(async () => ({ cards: [] }));
vi.mock('@/lib/api/v1/reads', () => ({ getCardsByKeys: (...a: unknown[]) => getCardsByKeys(...(a as [])) }));

const { GET } = await import('./route');
const get = (query: string) => GET(new Request(`http://localhost/api/v1/cards${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('GET /api/v1/cards?keys=', () => {
  it('passes the keys in the order asked', async () => {
    const res = await get('?keys=a-walk,%20c1,,x_2');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cards: [] });
    expect(getCardsByKeys).toHaveBeenCalledWith({}, 'alice', ['a-walk', 'c1', 'x_2']);
  });

  it('refuses no keys, a key that could be a path, and more than 30', async () => {
    for (const query of ['', '?keys=', '?keys=a,..%2Fusers', '?keys=a/b', `?keys=${Array.from({ length: 31 }, (_, i) => `k${i}`).join(',')}`]) {
      const res = await get(query);
      expect(res.status, query).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_request');
    }
    expect(getCardsByKeys).not.toHaveBeenCalled();
  });
});
