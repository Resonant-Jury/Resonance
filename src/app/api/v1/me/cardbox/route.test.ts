import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/me/cardbox: what it reads from the request (the shelves are
// checked against the emulator in test/emulator/apiV1Reads.emulator.test.ts).

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const getCardBoxShelves = vi.fn();
vi.mock('@/lib/api/v1/reads', () => ({ getCardBoxShelves: (...a: unknown[]) => getCardBoxShelves(...a) }));

const { GET } = await import('./route');
const get = (query: string) => GET(new Request(`http://localhost/api/v1/me/cardbox${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  getCardBoxShelves.mockResolvedValue({ published: { cards: [] } });
});

describe('GET /api/v1/me/cardbox', () => {
  it('asks for the shelves named, ignoring names it does not know', async () => {
    const res = await get('?shelves=published,%20draft,drafts,likes,');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ published: { cards: [] } });
    expect(getCardBoxShelves).toHaveBeenCalledWith({}, 'alice', new Set(['published', 'draft']));
    // The viewer's own things: kept, but checked on every use.
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('is invalid_request without `shelves`', async () => {
    const res = await get('');
    expect(res.status).toBe(400);
    expect((await res.json()).error.issues.map((i: { path: string }) => i.path)).toEqual(['shelves']);
    expect(getCardBoxShelves).not.toHaveBeenCalled();
  });
});
