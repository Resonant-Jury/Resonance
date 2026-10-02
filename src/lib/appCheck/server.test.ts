import { afterEach, describe, expect, it, vi } from 'vitest';

// The server half of App Check: Cloudflare's word on a Turnstile token, the
// exchange's brake, and how the API's watch reports what it saw.

const appCheck = vi.hoisted(() => ({ verifyToken: vi.fn(), createToken: vi.fn() }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => appCheck }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: vi.fn() }));

import {
  checkAppCheck,
  platformOf,
  resetExchanges,
  resetTally,
  routePattern,
  spendExchange,
  tally,
  verifyTurnstile,
} from './server';

function cloudflare(answer: unknown, status = 200) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify(answer), { status }));
}

const HOST = 'resonance-world.vercel.app';

afterEach(() => {
  resetTally();
  resetExchanges();
  vi.clearAllMocks();
});

describe('verifyTurnstile', () => {
  it('passes a token Cloudflare says was solved on our host for the App Check action', async () => {
    const fetch = cloudflare({ success: true, hostname: HOST, action: 'app-check' });
    expect(await verifyTurnstile('tok', { host: HOST, remoteIp: '1.2.3.4', fetch, secret: 's3cret' })).toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    const sent = init!.body as URLSearchParams;
    expect(Object.fromEntries(sent)).toEqual({ secret: 's3cret', response: 'tok', remoteip: '1.2.3.4' });
  });

  it('refuses a used or bad token, another host, another action', async () => {
    const opts = (answer: unknown) => ({ host: HOST, fetch: cloudflare(answer), secret: 's' });
    expect(await verifyTurnstile('t', opts({ success: false, 'error-codes': ['timeout-or-duplicate'] }))).toEqual({
      ok: false,
      reason: 'rejected',
      codes: ['timeout-or-duplicate'],
    });
    expect(await verifyTurnstile('t', opts({ success: true, hostname: 'evil.example', action: 'app-check' }))).toMatchObject({ reason: 'wrong-host' });
    expect(await verifyTurnstile('t', opts({ success: true, hostname: HOST, action: 'login' }))).toMatchObject({ reason: 'wrong-action' });
  });

  it('says so when there is no secret or Cloudflare can not be asked, without asking', async () => {
    const fetch = cloudflare({});
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    expect(await verifyTurnstile('t', { host: HOST, fetch })).toEqual({ ok: false, reason: 'unconfigured' });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    expect(await verifyTurnstile('t', { host: HOST, fetch: cloudflare({}, 500), secret: 's' })).toEqual({ ok: false, reason: 'unavailable' });
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    expect(await verifyTurnstile('t', { host: HOST, fetch: down, secret: 's' })).toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('the exchange budget', () => {
  it('lets one address exchange ten times in ten minutes, then again after', () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 10; i++) expect(spendExchange('1.2.3.4', t0 + i)).toBe(true);
    expect(spendExchange('1.2.3.4', t0 + 20)).toBe(false);
    expect(spendExchange('5.6.7.8', t0 + 20)).toBe(true);
    expect(spendExchange('1.2.3.4', t0 + 10 * 60 * 1000)).toBe(true);
  });
});

describe('watching API requests', () => {
  it('names the route, never the card or person in its path', () => {
    expect(routePattern('/api/v1/cards/a-walk-after-rain/related')).toBe('/api/v1/cards/:/related');
    expect(routePattern('/api/v1/users/念誠')).toBe('/api/v1/users/:');
    expect(routePattern('/api/v1/me/devices/abc-123')).toBe('/api/v1/me/devices/:');
    expect(routePattern('/api/v1/feed/recommended')).toBe('/api/v1/feed/recommended');
  });

  it('tells the platform from the Firebase app id', () => {
    expect(platformOf('1:123:web:abc')).toBe('web');
    expect(platformOf('1:123:ios:abc')).toBe('ios');
    expect(platformOf(undefined)).toBe('unknown');
  });

  it('reads a request: missing, valid (with its app), or invalid', async () => {
    const req = (token?: string) => new Request('https://x/api/v1/feed', { headers: token ? { 'X-Firebase-AppCheck': token } : {} });
    expect(await checkAppCheck(req())).toEqual({ verdict: 'missing', platform: 'unknown' });
    expect(appCheck.verifyToken).not.toHaveBeenCalled();

    appCheck.verifyToken.mockResolvedValueOnce({ appId: '1:123:android:abc' });
    expect(await checkAppCheck(req('good'))).toEqual({ verdict: 'valid', platform: 'android' });
    appCheck.verifyToken.mockRejectedValueOnce(new Error('expired'));
    expect(await checkAppCheck(req('old'))).toEqual({ verdict: 'invalid', platform: 'unknown' });
  });

  it('logs the first of a kind at once, then one line per ten minutes with how many it stands for', () => {
    const t0 = 5_000_000;
    expect(tally('missing', 'unknown', '/api/v1/feed', t0)).toBe('[appcheck] missing unknown /api/v1/feed ×1');
    expect(tally('missing', 'unknown', '/api/v1/feed', t0 + 1000)).toBeNull();
    expect(tally('valid', 'web', '/api/v1/feed', t0 + 1000)).toBe('[appcheck] valid web /api/v1/feed ×1');
    expect(tally('missing', 'unknown', '/api/v1/feed', t0 + 2000)).toBeNull();
    expect(tally('missing', 'unknown', '/api/v1/feed', t0 + 10 * 60 * 1000)).toBe('[appcheck] missing unknown /api/v1/feed ×3');
    expect(tally('missing', 'unknown', '/api/v1/feed', t0 + 10 * 60 * 1000 + 1)).toBeNull();
  });
});
