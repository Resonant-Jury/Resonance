import { beforeEach, describe, expect, it, vi } from 'vitest';

// POST /api/auth/session turns an ID token into the session cookie — only
// for this site's own pages. A page elsewhere can't sign a visitor in as
// someone else (login CSRF): not with a form (never JSON), not with a fetch
// (its Origin is another host). A bad token is a 401, not a crash.

const createSessionCookie = vi.fn(async (token: string) => {
  if (token !== 'good-token') throw new Error('auth/argument-error');
  return 'minted-cookie';
});
vi.mock('@/lib/auth/firebase/server', () => ({
  createSessionCookie: (t: string) => createSessionCookie(t),
  SESSION_COOKIE_NAME: '__session',
}));

const { POST } = await import('./route');

beforeEach(() => {
  createSessionCookie.mockClear();
});

function signIn(headers: Record<string, string>, body = JSON.stringify({ idToken: 'good-token' })) {
  return POST(new Request('https://resonance.example/api/auth/session', { method: 'POST', body, headers: { host: 'resonance.example', ...headers } }));
}

describe('POST /api/auth/session', () => {
  it("signs in this site's own page", async () => {
    const res = await signIn({ 'content-type': 'application/json', origin: 'https://resonance.example', 'sec-fetch-site': 'same-origin' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('__session=minted-cookie');
  });

  it('follows the host it is reached at (a preview deployment, behind the proxy)', async () => {
    const res = await signIn({ 'content-type': 'application/json', origin: 'https://preview-1.vercel.app', 'x-forwarded-host': 'preview-1.vercel.app' });
    expect(res.status).toBe(200);
  });

  it("refuses another site's page: a fetch from elsewhere, or a form (never JSON)", async () => {
    const elsewhere = await signIn({ 'content-type': 'application/json', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
    const form = await signIn({ 'content-type': 'text/plain', origin: 'https://resonance.example' }, '{"idToken":"good-token"}');
    const urlencoded = await signIn({ 'content-type': 'application/x-www-form-urlencoded' }, 'idToken=good-token');
    const noOrigin = await signIn({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' });
    for (const res of [elsewhere, form, urlencoded, noOrigin]) {
      expect(res.status).toBe(403);
      expect(res.headers.get('set-cookie')).toBeNull();
    }
    expect(createSessionCookie).not.toHaveBeenCalled();
  });

  it('answers 401 for a token Firebase refuses, 400 for none', async () => {
    const bad = await signIn({ 'content-type': 'application/json', origin: 'https://resonance.example' }, JSON.stringify({ idToken: 'forged' }));
    expect(bad.status).toBe(401);
    expect(bad.headers.get('set-cookie')).toBeNull();
    const none = await signIn({ 'content-type': 'application/json', origin: 'https://resonance.example' }, '{}');
    expect(none.status).toBe(400);
  });
});
