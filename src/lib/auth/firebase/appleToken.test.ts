// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Deleting an account that signs in with Apple revokes its Apple token first
// (App Store 5.1.1(v)): Apple's window confirms it is them, Firebase revokes
// the access token that comes back — and only closing that window stops the
// deletion.

const fb = vi.hoisted(() => {
  const auth = { currentUser: null as unknown };
  return {
    auth,
    reauthenticateWithPopup: vi.fn(),
    revokeAccessToken: vi.fn(),
    credentialFromResult: vi.fn(),
  };
});
vi.mock('firebase/app', () => ({ getApps: () => [{}], initializeApp: vi.fn() }));
vi.mock('firebase/auth', () => ({
  getAuth: () => fb.auth,
  initializeAuth: () => fb.auth,
  reauthenticateWithPopup: fb.reauthenticateWithPopup,
  revokeAccessToken: fb.revokeAccessToken,
  connectAuthEmulator: vi.fn(),
  OAuthProvider: class {
    static credentialFromResult = fb.credentialFromResult;
    params: Record<string, string> = {};
    constructor(readonly providerId: string) {}
    setCustomParameters(params: Record<string, string>) {
      this.params = params;
    }
    addScope() {}
  },
  GoogleAuthProvider: class {},
  browserPopupRedirectResolver: 'popup-resolver',
  indexedDBLocalPersistence: 'indexedDB',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
}));

function account(...providers: string[]) {
  return { uid: 'me', providerData: providers.map((providerId) => ({ providerId })) };
}

/** A fresh copy of the module, with the site's Sign in with Apple flag as given. */
async function load(appleOnTheWeb = true) {
  vi.stubEnv('NEXT_PUBLIC_ENABLE_APPLE_SIGNIN', appleOnTheWeb ? 'true' : 'false');
  vi.resetModules();
  return import('./appleToken');
}

const failure = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  fb.auth.currentUser = account('apple.com');
  fb.reauthenticateWithPopup.mockReset().mockResolvedValue({ user: fb.auth.currentUser });
  fb.credentialFromResult.mockReset().mockReturnValue({ accessToken: 'apple-access' });
  fb.revokeAccessToken.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('revoking the Apple token on account deletion', () => {
  it("confirms with Apple in its window, in the page's language, then revokes the token it hands back", async () => {
    const { hasAppleToken, revokeAppleToken } = await load();
    expect(hasAppleToken()).toBe(true);

    await expect(revokeAppleToken('zh-TW')).resolves.toBe('revoked');
    const [user, provider, resolver] = fb.reauthenticateWithPopup.mock.calls[0];
    // The signed-in account itself: Firebase refuses an Apple ID that isn't its own.
    expect(user).toBe(fb.auth.currentUser);
    expect(provider).toMatchObject({ providerId: 'apple.com', params: { locale: 'zh_TW' } });
    expect(resolver).toBe('popup-resolver');
    expect(fb.revokeAccessToken).toHaveBeenCalledWith(fb.auth, 'apple-access');
  });

  it('leaves an account without Apple alone — Google too', async () => {
    fb.auth.currentUser = account('google.com');
    const { hasAppleToken, revokeAppleToken } = await load();
    expect(hasAppleToken()).toBe(false);
    await expect(revokeAppleToken()).resolves.toBe('none');
    expect(fb.reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it('finds Apple among several ways in', async () => {
    fb.auth.currentUser = account('google.com', 'apple.com');
    const { revokeAppleToken } = await load();
    await expect(revokeAppleToken()).resolves.toBe('revoked');
  });

  it('asks nothing of Apple where the site has no Sign in with Apple set up', async () => {
    const { hasAppleToken, revokeAppleToken } = await load(false);
    expect(hasAppleToken()).toBe(false);
    await expect(revokeAppleToken()).resolves.toBe('none');
    expect(fb.reauthenticateWithPopup).not.toHaveBeenCalled();
  });

  it("says so when the person closes Apple's window, and revokes nothing", async () => {
    const { revokeAppleToken } = await load();
    for (const code of ['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled']) {
      fb.reauthenticateWithPopup.mockRejectedValueOnce(failure(code));
      await expect(revokeAppleToken()).resolves.toBe('cancelled');
    }
    expect(fb.revokeAccessToken).not.toHaveBeenCalled();
  });

  it('tells a blocked window apart, so the page can ask for another tap', async () => {
    fb.reauthenticateWithPopup.mockRejectedValueOnce(failure('auth/popup-blocked'));
    const { revokeAppleToken } = await load();
    await expect(revokeAppleToken()).resolves.toBe('blocked');
    expect(fb.revokeAccessToken).not.toHaveBeenCalled();
  });

  it('lets the deletion go ahead when Apple or Firebase fails', async () => {
    const { revokeAppleToken } = await load();

    // Another Apple ID than the account's.
    fb.reauthenticateWithPopup.mockRejectedValueOnce(failure('auth/user-mismatch'));
    await expect(revokeAppleToken()).resolves.toBe('failed');
    expect(fb.revokeAccessToken).not.toHaveBeenCalled();

    // No access token came back.
    fb.credentialFromResult.mockReturnValueOnce(null);
    await expect(revokeAppleToken()).resolves.toBe('failed');
    expect(fb.revokeAccessToken).not.toHaveBeenCalled();

    // Firebase couldn't revoke it.
    fb.revokeAccessToken.mockRejectedValueOnce(failure('auth/invalid-credential'));
    await expect(revokeAppleToken()).resolves.toBe('failed');
  });
});
