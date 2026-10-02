import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/app-check: a Turnstile token solved on this site becomes an App
// Check token for the web app — and nothing else does.

const appCheck = vi.hoisted(() => ({ createToken: vi.fn(), verifyToken: vi.fn() }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => appCheck }));
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminDb: vi.fn() }));

import { resetExchanges } from '@/lib/appCheck/server';
import { POST } from './route';

const cloudflare = vi.fn();

function post(body: unknown, ip = '1.2.3.4') {
  return POST(
    new Request('https://resonance-world.vercel.app/api/app-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-real-ip': ip },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance-world.vercel.app');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:123:web:abc');
  vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
  vi.stubGlobal('fetch', cloudflare);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  appCheck.createToken.mockResolvedValue({ token: 'app-check-token', ttlMillis: 43_200_000 });
});
afterEach(() => {
  resetExchanges();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  cloudflare.mockReset();
});

const solved = () => new Response(JSON.stringify({ success: true, hostname: 'resonance-world.vercel.app', action: 'app-check' }));

describe('POST /api/app-check', () => {
  it("trades a good Turnstile token for the web app's App Check token, never cached", async () => {
    cloudflare.mockResolvedValueOnce(solved());
    const res = await post({ token: 'turnstile' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: 'app-check-token', ttlMillis: 43_200_000 });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(appCheck.createToken).toHaveBeenCalledWith('1:123:web:abc', { ttlMillis: 43_200_000 });
    // Cloudflare was asked with our secret, about the caller's address.
    const sent = Object.fromEntries(cloudflare.mock.calls[0][1].body as URLSearchParams);
    expect(sent).toEqual({ secret: 'test-secret', response: 'turnstile', remoteip: '1.2.3.4' });
  });

  it('mints nothing for a token Cloudflare refuses, or one solved elsewhere', async () => {
    cloudflare.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })));
    expect((await post({ token: 'reused' })).status).toBe(403);
    cloudflare.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, hostname: 'elsewhere.example', action: 'app-check' })));
    expect((await post({ token: 'theirs' })).status).toBe(403);
    expect(appCheck.createToken).not.toHaveBeenCalled();
  });

  it('refuses a malformed body before asking anyone', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ token: 'x'.repeat(5000) })).status).toBe(400);
    expect(cloudflare).not.toHaveBeenCalled();
  });

  it('answers 503, not 403, when it can not check (no secret set, Cloudflare down, minting failed)', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    expect((await post({ token: 't' })).status).toBe(503);
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    cloudflare.mockRejectedValueOnce(new TypeError('fetch failed'));
    expect((await post({ token: 't' })).status).toBe(503);
    cloudflare.mockResolvedValueOnce(solved());
    appCheck.createToken.mockRejectedValueOnce(new Error('permission denied'));
    expect((await post({ token: 't' })).status).toBe(503);
  });

  it('stops one address after ten exchanges in a window', async () => {
    cloudflare.mockImplementation(async () => solved());
    for (let i = 0; i < 10; i++) expect((await post({ token: `t${i}` })).status).toBe(200);
    expect((await post({ token: 't10' })).status).toBe(429);
    expect((await post({ token: 't11' }, '5.6.7.8')).status).toBe(200);
  });
});
