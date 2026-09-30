import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/firebase/server', () => ({ getAdminAuth: () => ({ deleteUser: vi.fn() }) }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/storage', () => ({ getStorageProvider: () => ({ deletePrefix: vi.fn() }) }));
vi.mock('@/lib/account/deletion', () => ({ purgeDueAccounts: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { purgeDueAccounts } from '@/lib/account/deletion';
import { GET } from './route';

function call(authorization?: string) {
  return GET(
    new Request('http://localhost/api/cron/purge-accounts', {
      headers: authorization ? { authorization } : {},
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(purgeDueAccounts).mockResolvedValue(['alice']);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/purge-accounts', () => {
  it('runs the purge for Vercel Cron (Bearer CRON_SECRET)', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ purged: 1 });
    expect(purgeDueAccounts).toHaveBeenCalledTimes(1);
  });

  it("drops the purged accounts' cached pages in every locale", async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    await call('Bearer s3cret');
    const { revalidate } = vi.mocked(purgeDueAccounts).mock.calls[0][0];
    revalidate?.(['/card/a-card', '/u/alice']);
    expect(vi.mocked(revalidatePath).mock.calls.map(([p]) => p)).toEqual([
      '/en/card/a-card', '/zh-TW/card/a-card', '/en/u/alice', '/zh-TW/u/alice',
    ]);
  });

  it('refuses a wrong or missing secret', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call()).status).toBe(401);
    expect(purgeDueAccounts).not.toHaveBeenCalled();
  });

  it('refuses everyone when CRON_SECRET is not configured', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(purgeDueAccounts).not.toHaveBeenCalled();
  });
});
