import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Signing requests in: tokens are verified locally; whether the account was
// since disabled or signed out everywhere is asked of Firebase Auth — every
// time for writes, at most every REVOCATION_CACHE_MS per instance for reads.

const auth = {
  verifyIdToken: vi.fn(),
  verifySessionCookie: vi.fn(),
  getUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
};
vi.mock('firebase-admin/app', () => ({ getApps: () => [{}], initializeApp: vi.fn(), cert: vi.fn(), applicationDefault: vi.fn() }));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => auth }));
let authorization: string | null = null;
let sessionCookie: string | null = null;
vi.mock('next/headers', () => ({
  headers: async () => new Headers(authorization ? { authorization } : {}),
  cookies: async () => ({ get: () => (sessionCookie ? { value: sessionCookie } : undefined) }),
}));

const { AuthUnavailableError, REVOCATION_CACHE_MS, forgetAccountState, getCurrentUser, revokeSessions } = await import('./server');

const SIGNED_IN_AT = Date.parse('2026-10-01T08:00:00Z');
const token = (uid: string) => ({ uid, sub: uid, auth_time: SIGNED_IN_AT / 1000, exp: SIGNED_IN_AT / 1000 + 3600, email: `${uid}@example.com` });
const account = (extra: { disabled?: boolean; tokensValidAfterTime?: string } = {}) => ({ disabled: false, tokensValidAfterTime: undefined, ...extra });
const authError = (code: string, message = code) => Object.assign(new Error(message), { code });
const bearer = (uid: string) => {
  authorization = `Bearer token-of-${uid}`;
  sessionCookie = null;
  auth.verifyIdToken.mockResolvedValue(token(uid));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(SIGNED_IN_AT + 60_000);
  auth.getUser.mockResolvedValue(account());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getCurrentUser', () => {
  it("verifies a token locally, leaving the revocation check to its own lookup", async () => {
    bearer('ann');
    expect(await getCurrentUser()).toMatchObject({ id: 'ann', email: 'ann@example.com' });
    expect(auth.verifyIdToken).toHaveBeenCalledWith('token-of-ann');
    expect(auth.getUser).toHaveBeenCalledWith('ann');
  });

  it("lets reads rely on this instance's recent answer, and asks again once it is old", async () => {
    bearer('ben');
    await getCurrentUser({ revocation: 'cached' });
    await getCurrentUser({ revocation: 'cached' });
    expect(auth.getUser).toHaveBeenCalledTimes(1);
    vi.setSystemTime(Date.now() + REVOCATION_CACHE_MS);
    await getCurrentUser({ revocation: 'cached' });
    expect(auth.getUser).toHaveBeenCalledTimes(2);
  });

  it('asks Firebase Auth on every write (and by default)', async () => {
    bearer('cat');
    await getCurrentUser({ revocation: 'cached' });
    await getCurrentUser({ revocation: 'live' });
    await getCurrentUser();
    expect(auth.getUser).toHaveBeenCalledTimes(3);
  });

  it('shares one lookup between reads arriving together', async () => {
    bearer('dan');
    await Promise.all([getCurrentUser({ revocation: 'cached' }), getCurrentUser({ revocation: 'cached' })]);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it('refuses a session signed out everywhere, a disabled account and a deleted one', async () => {
    bearer('eve');
    auth.getUser.mockResolvedValueOnce(account({ tokensValidAfterTime: new Date(SIGNED_IN_AT + 1_000).toUTCString() }));
    expect(await getCurrentUser()).toBeNull();
    auth.getUser.mockResolvedValueOnce(account({ tokensValidAfterTime: new Date(SIGNED_IN_AT).toUTCString() }));
    expect(await getCurrentUser()).toMatchObject({ id: 'eve' }); // signed in again since
    auth.getUser.mockResolvedValueOnce(account({ disabled: true }));
    expect(await getCurrentUser()).toBeNull();
    auth.getUser.mockRejectedValueOnce(authError('auth/user-not-found'));
    expect(await getCurrentUser()).toBeNull();
  });

  it('refuses an expired or forged token without asking about the account', async () => {
    bearer('fay');
    auth.verifyIdToken.mockRejectedValueOnce(authError('auth/id-token-expired'));
    expect(await getCurrentUser({ revocation: 'cached' })).toBeNull();
    auth.verifyIdToken.mockRejectedValueOnce(authError('auth/argument-error', 'Firebase ID token has invalid signature.'));
    expect(await getCurrentUser({ revocation: 'cached' })).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("is an outage, not a sign-out, when Firebase Auth or Google's keys can't be reached", async () => {
    bearer('gus');
    auth.getUser.mockRejectedValueOnce(authError('auth/internal-error'));
    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthUnavailableError);
    auth.getUser.mockRejectedValueOnce(authError('app/network-timeout'));
    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthUnavailableError);
    auth.verifyIdToken.mockRejectedValueOnce(authError('auth/argument-error', 'Error fetching public keys for Google certs: socket hang up'));
    await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthUnavailableError);
    // And nothing was remembered from the failures.
    await getCurrentUser({ revocation: 'cached' });
    expect(auth.getUser).toHaveBeenCalledTimes(3);
  });

  it('reads the session cookie the same way when there is no bearer token', async () => {
    authorization = null;
    sessionCookie = 'cookie';
    auth.verifySessionCookie.mockResolvedValue(token('hal'));
    expect(await getCurrentUser({ revocation: 'cached' })).toMatchObject({ id: 'hal' });
    expect(auth.verifySessionCookie).toHaveBeenCalledWith('cookie');
    sessionCookie = null;
    expect(await getCurrentUser()).toBeNull();
  });
});

describe('revokeSessions', () => {
  it('signs the account out everywhere and forgets it here at once', async () => {
    bearer('ivy');
    await getCurrentUser({ revocation: 'cached' });
    auth.getUser.mockResolvedValue(account({ tokensValidAfterTime: new Date(Date.now()).toUTCString() }));

    await revokeSessions('ivy');

    expect(auth.revokeRefreshTokens).toHaveBeenCalledWith('ivy');
    expect(await getCurrentUser({ revocation: 'cached' })).toBeNull();
  });

  it('keeps a lookup that was under way during the revocation from being remembered', async () => {
    bearer('jon');
    let answer!: (a: ReturnType<typeof account>) => void;
    auth.getUser.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const before = getCurrentUser({ revocation: 'cached' });
    while (!auth.getUser.mock.calls.length) await Promise.resolve(); // the lookup is under way
    forgetAccountState('jon');
    answer(account());
    await before;

    auth.getUser.mockResolvedValue(account({ disabled: true }));
    expect(await getCurrentUser({ revocation: 'cached' })).toBeNull();
  });
});
