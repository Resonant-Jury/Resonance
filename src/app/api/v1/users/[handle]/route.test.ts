import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/v1/users/{handle}?include=cards,links&limit= passes what it was
// asked for to the profile read (see apiV1Reads.emulator.test.ts for what
// comes back).

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const getProfile = vi.fn(async () => ({ isSelf: false }));
vi.mock('@/lib/api/v1/reads', () => ({ getProfile: (...a: unknown[]) => getProfile(...(a as [])) }));

const { GET } = await import('./route');
const get = (handle: string, query = '') =>
  GET(new Request(`http://localhost/api/v1/users/${handle}${query}`), { params: Promise.resolve({ handle }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('GET /api/v1/users/{handle}', () => {
  it('passes the lists asked for and the page size, by a pen name in any script', async () => {
    expect((await get(encodeURIComponent('小艾'), '?include=links,cards,friends&limit=5')).status).toBe(200);
    expect(getProfile).toHaveBeenCalledWith({}, 'alice', '小艾', { include: new Set(['links', 'cards']), limit: 5 });
  });

  it('asks for no lists by default, with the default page size', async () => {
    await get('bob');
    expect(getProfile).toHaveBeenCalledWith({}, 'alice', 'bob', { include: new Set(), limit: 12 });
  });

  it('refuses a page size off the contract', async () => {
    expect((await get('bob', '?include=cards&limit=31')).status).toBe(400);
    expect((await get('bob', '?include=cards&limit=0')).status).toBe(400);
    expect(getProfile).not.toHaveBeenCalled();
  });
});
