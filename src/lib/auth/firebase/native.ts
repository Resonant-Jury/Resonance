'use client';

import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  type Auth,
  type UserCredential,
} from 'firebase/auth';

/** True when running inside the Capacitor shell (iOS or Android app). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** True when running inside the iOS Capacitor shell specifically. */
export function isIosNativeApp(): boolean {
  return Capacitor.getPlatform() === 'ios';
}

/**
 * Native Google Sign-In for the Capacitor shell. Google's WebView OAuth is
 * blocked (`disallowed_useragent`), so the account picker runs natively
 * (Credential Manager on Android, GoogleSignIn SDK on iOS) with
 * `skipNativeAuth` — the resulting ID token is then handed to the web
 * Firebase SDK via `signInWithCredential`, so the whole session pipeline
 * (`onIdTokenChanged` → session cookie) behaves exactly like the browser flow.
 */
export async function signInWithGoogleNative(auth: Auth): Promise<UserCredential> {
  const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Native Google sign-in returned no ID token');
  const credential = GoogleAuthProvider.credential(idToken, result.credential?.accessToken);
  return signInWithCredential(auth, credential);
}

/**
 * Native Sign in with Apple (iOS shell). `skipNativeAuth` is required here:
 * the Apple ID token's nonce can only be consumed once, so it must go to the
 * web SDK — letting the native Firebase SDK consume it first would make the
 * web-side credential exchange fail.
 */
export async function signInWithAppleNative(auth: Auth): Promise<UserCredential> {
  const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error('Native Apple sign-in returned no ID token');
  const provider = new OAuthProvider('apple.com');
  const credential = provider.credential({ idToken, rawNonce: result.credential?.nonce });
  return signInWithCredential(auth, credential);
}
