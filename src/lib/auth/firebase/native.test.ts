import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock at the module boundary: the Capacitor plugin produces OAuth
// credentials, firebase/auth consumes them. The tests pin the bridge
// contract — especially that Apple's raw nonce reaches the web SDK
// (a once-only value; losing it breaks the credential exchange).
const signInWithGoogle = vi.fn();
const signInWithApple = vi.fn();
vi.mock('@capacitor-firebase/authentication', () => ({
  FirebaseAuthentication: {
    signInWithGoogle: (...args: unknown[]) => signInWithGoogle(...args),
    signInWithApple: (...args: unknown[]) => signInWithApple(...args),
  },
}));

const googleCredential = vi.fn();
const oauthCredential = vi.fn();
const signInWithCredential = vi.fn();
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: { credential: (...args: unknown[]) => googleCredential(...args) },
  OAuthProvider: class {
    providerId: string;
    constructor(providerId: string) {
      this.providerId = providerId;
    }
    credential(params: unknown) {
      return oauthCredential(this.providerId, params);
    }
  },
  signInWithCredential: (...args: unknown[]) => signInWithCredential(...args),
}));

import { signInWithAppleNative, signInWithGoogleNative } from './native';
import type { Auth } from 'firebase/auth';

const auth = { name: 'test-auth' } as unknown as Auth;

beforeEach(() => {
  vi.clearAllMocks();
  signInWithCredential.mockResolvedValue({ user: { uid: 'u1' } });
});

describe('signInWithGoogleNative', () => {
  it('skips native auth and signs the Google ID token into the web SDK', async () => {
    signInWithGoogle.mockResolvedValue({
      credential: { idToken: 'g-id-token', accessToken: 'g-access-token' },
    });
    googleCredential.mockReturnValue('google-cred');

    const result = await signInWithGoogleNative(auth);

    expect(signInWithGoogle).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(googleCredential).toHaveBeenCalledWith('g-id-token', 'g-access-token');
    expect(signInWithCredential).toHaveBeenCalledWith(auth, 'google-cred');
    expect(result.user.uid).toBe('u1');
  });

  it('throws when the native layer returns no ID token', async () => {
    signInWithGoogle.mockResolvedValue({ credential: null });
    await expect(signInWithGoogleNative(auth)).rejects.toThrow(/no ID token/);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});

describe('signInWithAppleNative', () => {
  it('passes the Apple ID token and raw nonce to the web SDK credential', async () => {
    signInWithApple.mockResolvedValue({
      credential: { idToken: 'a-id-token', nonce: 'raw-nonce' },
    });
    oauthCredential.mockReturnValue('apple-cred');

    await signInWithAppleNative(auth);

    expect(signInWithApple).toHaveBeenCalledWith({ skipNativeAuth: true });
    expect(oauthCredential).toHaveBeenCalledWith('apple.com', {
      idToken: 'a-id-token',
      rawNonce: 'raw-nonce',
    });
    expect(signInWithCredential).toHaveBeenCalledWith(auth, 'apple-cred');
  });

  it('throws when the native layer returns no ID token', async () => {
    signInWithApple.mockResolvedValue({ credential: null });
    await expect(signInWithAppleNative(auth)).rejects.toThrow(/no ID token/);
    expect(signInWithCredential).not.toHaveBeenCalled();
  });
});
