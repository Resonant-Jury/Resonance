import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /api/account/export around the export itself (which is checked against
// the emulator in test/emulator/accountPurge.emulator.test.ts): it streams the
// pieces as they come, and only answers once the first is in hand.

const getCurrentUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getCurrentUser: (...a: unknown[]) => getCurrentUser(...a) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
const limited = vi.fn();
vi.mock('@/lib/api/rateLimit', () => ({ limited: (...a: unknown[]) => limited(...a) }));
let pieces: () => AsyncGenerator<string> = async function* () {};
vi.mock('@/lib/account/export', () => ({ exportAccountJson: () => pieces() }));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: 'alice' });
  limited.mockResolvedValue(null);
});

describe('GET /api/account/export', () => {
  it('streams the backup as an attachment, piece by piece', async () => {
    pieces = async function* () {
      yield '{"profile":{"handle":"alice"}';
      yield ',"cards":[{"id":"c1"}]';
      yield '}';
    };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="resonance-backup-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(await res.text())).toEqual({ profile: { handle: 'alice' }, cards: [{ id: 'c1' }] });
    expect(limited).toHaveBeenCalledWith({}, 'alice', 'export');
  });

  it('fails as a whole when the backup cannot start, rather than sending a broken file', async () => {
    pieces = async function* () {
      throw new Error('Firestore unavailable');
    };
    await expect(GET()).rejects.toThrow('Firestore unavailable');
  });

  it('aborts the download when a later piece fails, so it never saves as a complete file', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    pieces = async function* () {
      yield '{"profile":null';
      throw new Error('lost the connection');
    };
    const res = await GET();
    await expect(res.text()).rejects.toThrow('lost the connection');
  });

  it('is refused past the daily budget, and without a session', async () => {
    limited.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await GET()).status).toBe(429);
    getCurrentUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
