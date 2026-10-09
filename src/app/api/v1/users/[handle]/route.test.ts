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
const get = (handle: string, query = '', headers: Record<string, string> = {}) =>
  GET(new Request(`http://localhost/api/v1/users/${handle}${query}`, { headers }), { params: Promise.resolve({ handle }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
});

describe('GET /api/v1/users/{handle}', () => {
  it('passes the lists asked for and the page size, by a pen name in any script', async () => {
    expect((await get(encodeURIComponent('小艾'), '?include=links,cards,friends&limit=5')).status).toBe(200);
    expect(getProfile).toHaveBeenCalledWith({}, 'alice', '小艾', { include: new Set(['links', 'cards']), limit: 5, preLetterBuild: false });
  });

  it('asks for no lists by default, with the default page size', async () => {
    await get('bob');
    expect(getProfile).toHaveBeenCalledWith({}, 'alice', 'bob', { include: new Set(), limit: 12, preLetterBuild: false });
  });

  // They are told a letter waiting for their answer is a connection (lib/api/v1/preLetter; apiV1PreLetter.emulator.test.ts).
  it('says when the request comes from an app build made before letters (2.0.0: iOS ≤ 6, Android ≤ 7)', async () => {
    for (const [agent, old] of [
      ['Resonance/2.0.0 (iOS 18.5; build 6)', true],
      ['Resonance/2.0.0 (Android 15; build 7)', true],
      ['Resonance/2.0.0 (iOS 26.0; build 7)', false],
      ['Resonance/2.0.0 (Android 16; build 8)', false],
      ['Resonance/2.1.0 (iOS 26.0; build 1)', false],
      ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', false],
    ] as const) {
      getProfile.mockClear();
      await get('bob', '?include=cards', { 'User-Agent': agent });
      expect(getProfile).toHaveBeenCalledWith({}, 'alice', 'bob', { include: new Set(['cards']), limit: 12, preLetterBuild: old });
    }
  });

  it('refuses a page size off the contract', async () => {
    expect((await get('bob', '?include=cards&limit=31')).status).toBe(400);
    expect((await get('bob', '?include=cards&limit=0')).status).toBe(400);
    expect(getProfile).not.toHaveBeenCalled();
  });
});
