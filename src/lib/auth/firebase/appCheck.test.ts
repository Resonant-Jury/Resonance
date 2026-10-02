// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// App Check in the browser: started only on the site's own origin, a
// Turnstile challenge traded at our server for a token, a pause after a
// failure, and API calls that never wait on a challenge.

const sdk = vi.hoisted(() => ({
  provider: null as null | { getToken: () => Promise<{ token: string; expireTimeMillis: number }> },
  initializeAppCheck: vi.fn(),
  getToken: vi.fn(),
}));
vi.mock('firebase/app-check', () => ({
  CustomProvider: class {
    constructor(options: { getToken: () => Promise<{ token: string; expireTimeMillis: number }> }) {
      sdk.provider = options;
    }
  },
  initializeAppCheck: sdk.initializeAppCheck,
  getToken: sdk.getToken,
}));

import { TOKEN_UNTIL_KEY, appCheckHeaders, resetAppCheckForTests, startAppCheck } from './appCheck';

const app = { name: '[DEFAULT]' } as never;
const instance = { app };

/** A stand-in for Cloudflare's script: renders, then answers with `token` (or `error`). */
function turnstile(result: { token?: string; error?: string }) {
  const render = vi.fn((_box: HTMLElement, options: { callback: (t: string) => void; 'error-callback': (c: string) => void }) => {
    queueMicrotask(() => (result.token ? options.callback(result.token) : options['error-callback'](result.error ?? '110200')));
    return 'widget-1';
  });
  const remove = vi.fn();
  window.turnstile = { render, remove };
  return { render, remove };
}

const exchange = vi.fn();

beforeEach(() => {
  resetAppCheckForTests();
  sdk.provider = null;
  sdk.initializeAppCheck.mockReturnValue(instance);
  // jsdom's origin is http://localhost:3000.
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', '');
  vi.stubGlobal('fetch', exchange);
  // A token kept from an earlier visit, unless a test says otherwise.
  window.localStorage.setItem(TOKEN_UNTIL_KEY, String(Date.now() + 60 * 60_000));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
  delete window.turnstile;
  window.localStorage.clear();
});

describe('startAppCheck', () => {
  it('does nothing off the production origin, or against the emulators', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance-world.vercel.app');
    expect(await startAppCheck(app)).toBeNull();
    resetAppCheckForTests();
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_EMULATOR', 'true');
    expect(await startAppCheck(app)).toBeNull();
    expect(sdk.initializeAppCheck).not.toHaveBeenCalled();
  });

  it('starts once, at once, with a token kept from an earlier visit (no challenge)', async () => {
    const widget = turnstile({ token: 'unused' });
    expect(await startAppCheck(app)).toBe(instance);
    await startAppCheck(app);
    expect(sdk.initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(sdk.initializeAppCheck).toHaveBeenCalledWith(app, expect.objectContaining({ isTokenAutoRefreshEnabled: true }));
    expect(sdk.provider).not.toBeNull();
    expect(widget.render).not.toHaveBeenCalled();
  });

  it('on a first visit, solves the challenge before starting, so no read waits on it', async () => {
    window.localStorage.clear();
    const widget = turnstile({ token: 'turnstile-token' });
    exchange.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'first-token', ttlMillis: 43_200_000 })));

    expect(await startAppCheck(app)).toBe(instance);
    expect(widget.render).toHaveBeenCalledTimes(1);
    // The SDK's first asks — a read's, then its refresher's forced one right
    // after — get that token, with no second challenge.
    expect((await sdk.provider!.getToken()).token).toBe('first-token');
    expect((await sdk.provider!.getToken()).token).toBe('first-token');
    expect(widget.render).toHaveBeenCalledTimes(1);
    // And the next visit knows it has one.
    expect(Number(window.localStorage.getItem(TOKEN_UNTIL_KEY))).toBeGreaterThan(Date.now() + 43_000_000);

    // A refresh later on solves a new one.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 6 * 60 * 60_000);
    exchange.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'next-token', ttlMillis: 43_200_000 })));
    expect((await sdk.provider!.getToken()).token).toBe('next-token');
    expect(widget.render).toHaveBeenCalledTimes(2);
  });

  it('starts all the same when that first challenge fails (reads go without a token meanwhile)', async () => {
    window.localStorage.clear();
    turnstile({ error: '110200' });
    expect(await startAppCheck(app)).toBe(instance);
    // The SDK's own ask then waits out the pause instead of another challenge.
    await expect(sdk.provider!.getToken()).rejects.toThrow(/waiting/);
  });
});

describe('the Turnstile provider', () => {
  it('solves the invisible challenge for our site key and action, then trades it at our server', async () => {
    await startAppCheck(app);
    const widget = turnstile({ token: 'turnstile-token' });
    exchange.mockResolvedValueOnce(new Response(JSON.stringify({ token: 'app-check-token', ttlMillis: 60_000 })));

    const before = Date.now();
    const result = await sdk.provider!.getToken();
    expect(result.token).toBe('app-check-token');
    expect(result.expireTimeMillis).toBeGreaterThanOrEqual(before + 60_000);

    expect(widget.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: '0x4AAAAAAFLmj8Bq5kYcnuKA', action: 'app-check', retry: 'never' }),
    );
    expect(exchange).toHaveBeenCalledWith('/api/app-check', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'turnstile-token' }) }));
    // The widget and its box are gone once it answered.
    expect(widget.remove).toHaveBeenCalledWith('widget-1');
    expect(document.body.children).toHaveLength(0);
  });

  it('after a failure, waits before the next challenge (a minute, then longer)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    await startAppCheck(app);
    const widget = turnstile({ error: '600010' });

    await expect(sdk.provider!.getToken()).rejects.toThrow(/Turnstile error 600010/);
    // Right away again: refused without a challenge.
    await expect(sdk.provider!.getToken()).rejects.toThrow(/waiting/);
    expect(widget.render).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 61_000);
    await expect(sdk.provider!.getToken()).rejects.toThrow(/Turnstile error/);
    expect(widget.render).toHaveBeenCalledTimes(2);
    // The second failure waits two minutes.
    vi.setSystemTime(Date.now() + 61_000);
    await expect(sdk.provider!.getToken()).rejects.toThrow(/waiting/);
  });

  it('counts a refused exchange as a failure', async () => {
    await startAppCheck(app);
    turnstile({ token: 'turnstile-token' });
    exchange.mockResolvedValueOnce(new Response('{}', { status: 403 }));
    await expect(sdk.provider!.getToken()).rejects.toThrow(/403/);
    await expect(sdk.provider!.getToken()).rejects.toThrow(/waiting/);
  });
});

describe('appCheckHeaders', () => {
  it('carries the token when one is at hand', async () => {
    await startAppCheck(app);
    sdk.getToken.mockResolvedValueOnce({ token: 'app-check-token' });
    expect(await appCheckHeaders()).toEqual({ 'X-Firebase-AppCheck': 'app-check-token' });
    expect(sdk.getToken).toHaveBeenCalledWith(instance, false);
  });

  it('never makes a call wait on a challenge, nor fail with it', async () => {
    await startAppCheck(app);
    sdk.getToken.mockReturnValueOnce(new Promise(() => {}));
    expect(await appCheckHeaders()).toEqual({});
    sdk.getToken.mockRejectedValueOnce(new Error('no token'));
    expect(await appCheckHeaders()).toEqual({});
  });

  it('is empty where App Check does not run', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://resonance-world.vercel.app');
    await startAppCheck(app);
    expect(await appCheckHeaders()).toEqual({});
    expect(sdk.getToken).not.toHaveBeenCalled();
  });
});
