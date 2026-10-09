import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}) }));
vi.mock('@/lib/recommend/warm', () => ({ warmPicks: vi.fn() }));

import { warmPicks } from '@/lib/recommend/warm';
import { GET } from './route';

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/warm-picks', { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(warmPicks).mockResolvedValue({ readers: 3, outcomes: { built: 2, inactive: 1 }, deferred: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/warm-picks', () => {
  it('warms the picks for Vercel Cron, starting no build in the last minute of its 300 s and finishing every one before it ends', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const before = Date.now();
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ readers: 3, outcomes: { built: 2, inactive: 1 }, deferred: 0 });
    const [, opts] = vi.mocked(warmPicks).mock.calls[0];
    expect(opts!.deadline! - before).toBeGreaterThanOrEqual(240_000);
    expect(opts!.deadline! - Date.now()).toBeLessThanOrEqual(240_000);
    // A build started at 239 s still has to be done by then.
    expect(opts!.buildDeadline! - before).toBeGreaterThanOrEqual(295_000);
    expect(opts!.buildDeadline! - Date.now()).toBeLessThanOrEqual(295_000);
  });

  it('refuses a wrong or missing secret, and everyone while none is configured', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call()).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(warmPicks).not.toHaveBeenCalled();
  });
});
