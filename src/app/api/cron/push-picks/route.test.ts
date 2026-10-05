import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const messaging = { sendEachForMulticast: vi.fn() };
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: () => ({}), getAdminMessaging: async () => messaging }));
vi.mock('@/lib/push/picks', () => ({ pushPicks: vi.fn() }));

import { pushPicks } from '@/lib/push/picks';
import { GET } from './route';

const call = (authorization?: string) =>
  GET(new Request('http://localhost/api/cron/push-picks', { headers: authorization ? { authorization } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.mocked(pushPicks).mockResolvedValue({ readers: 2, outcomes: { sent: 1, 'opened-today': 1 }, deferred: 0 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('/api/cron/push-picks', () => {
  it("sends tonight's cards for Vercel Cron (Bearer CRON_SECRET), through FCM, starting nothing past 270 s", async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    const before = Date.now();
    const res = await call('Bearer s3cret');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ readers: 2, outcomes: { sent: 1, 'opened-today': 1 }, deferred: 0 });
    const [db, sender, opts] = vi.mocked(pushPicks).mock.calls[0];
    expect(db).toEqual({});
    expect(sender).toBe(messaging);
    expect(opts!.deadline! - before).toBeGreaterThanOrEqual(270_000);
    expect(opts!.deadline! - Date.now()).toBeLessThanOrEqual(270_000);
  });

  it('refuses a wrong or missing secret, and everyone while none is configured', async () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect((await call('Bearer nope')).status).toBe(401);
    expect((await call()).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await call('Bearer ')).status).toBe(401);
    expect(pushPicks).not.toHaveBeenCalled();
  });
});
