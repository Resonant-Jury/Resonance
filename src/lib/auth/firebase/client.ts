'use client';

import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import { isNativeApp, signInWithAppleNative, signInWithGoogleNative } from './native';
import type { IAuthProvider } from '../interfaces';
import type { AuthSession, AuthUser, PhoneVerificationInput, SignInInput, SignUpInput } from '../types';

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };
}

export function getFirebaseClientApp() {
  return getApps()[0] ?? initializeApp(firebaseConfig());
}

export function getFirebaseClientAuth() {
  return getAuth(getFirebaseClientApp());
}

export function mapFirebaseUser(user: FirebaseUser): AuthUser {
  return {
    id: user.uid,
    email: user.email,
    phoneNumber: user.phoneNumber,
    emailVerified: user.emailVerified,
  };
}

async function persistSession(user: FirebaseUser) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Unable to create session');
}

export class FirebaseClientAuthProvider implements IAuthProvider {
  async signIn(input: SignInInput): Promise<AuthUser> {
    const cred = await signInWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    await persistSession(cred.user);
    return mapFirebaseUser(cred.user);
  }

  async signUp(input: SignUpInput): Promise<AuthUser> {
    const cred = await createUserWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    await persistSession(cred.user);
    return mapFirebaseUser(cred.user);
  }

  async signInWithGoogle(): Promise<AuthUser> {
    let user: FirebaseUser;
    if (isNativeApp()) {
      // Google blocks OAuth in WebViews, so the shell app authenticates
      // through the native account picker instead of signInWithPopup.
      ({ user } = await signInWithGoogleNative(getFirebaseClientAuth()));
    } else {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      ({ user } = await signInWithPopup(getFirebaseClientAuth(), provider));
    }
    await persistSession(user);
    return mapFirebaseUser(user);
  }

  async signInWithApple(): Promise<AuthUser> {
    let user: FirebaseUser;
    if (isNativeApp()) {
      ({ user } = await signInWithAppleNative(getFirebaseClientAuth()));
    } else {
      // Web fallback; requires the Apple provider (Services ID) to be
      // configured in the Firebase console before it can succeed.
      ({ user } = await signInWithPopup(getFirebaseClientAuth(), new OAuthProvider('apple.com')));
    }
    await persistSession(user);
    return mapFirebaseUser(user);
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(getFirebaseClientAuth());
    await fetch('/api/auth/session', { method: 'DELETE' });
  }

  async verifyPhone(_input: PhoneVerificationInput): Promise<boolean> {
    return process.env.NEXT_PUBLIC_ENABLE_PHONE_OTP !== 'true';
  }

  async currentUser(): Promise<AuthUser | null> {
    const auth = getFirebaseClientAuth();
    if (auth.currentUser) return mapFirebaseUser(auth.currentUser);
    return new Promise((resolve) => {
      const off = onAuthStateChanged(auth, (user) => {
        off();
        resolve(user ? mapFirebaseUser(user) : null);
      });
    });
  }

  /**
   * Subscribe to auth changes and keep the server session cookie in sync.
   *
   * The `__session` cookie is minted with a fixed lifetime and is otherwise
   * never refreshed, whereas the client SDK holds a long-lived refresh token
   * and rotates the ID token roughly hourly. Left alone, the cookie lapses
   * while the SDK still considers the user signed in — so protected routes
   * bounce the user to /signin ("self logout"). `onIdTokenChanged` fires on
   * initial restore, on every token refresh, and on sign-out; re-persisting
   * the session cookie on each tick keeps it alive as long as the SDK does.
   *
   * @returns an unsubscribe function.
   */
  subscribe(onChange: (user: AuthUser | null) => void): () => void {
    const auth = getFirebaseClientAuth();
    return onIdTokenChanged(auth, async (user) => {
      if (user) {
        try {
          await persistSession(user);
        } catch {
          // Transient network/session error — keep the UI signed in; the next
          // token tick (or a manual reload) will retry the cookie refresh.
        }
      }
      onChange(user ? mapFirebaseUser(user) : null);
    });
  }

  async currentSession(): Promise<AuthSession | null> {
    const user = await this.currentUser();
    return user ? { user, expiresAt: null } : null;
  }
}

export const firebaseClientAuthProvider = new FirebaseClientAuthProvider();
