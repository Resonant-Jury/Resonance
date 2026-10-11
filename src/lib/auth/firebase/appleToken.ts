'use client';

import {
  OAuthProvider,
  browserPopupRedirectResolver,
  reauthenticateWithPopup,
  revokeAccessToken,
  type User,
} from 'firebase/auth';
import { APPLE_SIGN_IN, signInFailure } from '../providers';
import { appleProvider, getFirebaseClientAuth } from './client';

/**
 * Sign in with Apple's part in deleting an account (App Store 5.1.1(v)): an
 * account that signs in with Apple has its Apple token revoked as it
 * schedules its deletion, which takes Resonance off the person's Apple ID.
 * Signing back in with Apple within the grace period still works (Apple asks
 * for consent again) and still cancels the deletion. The iOS app does the
 * same with an authorization code (SessionStore.revokeAppleToken); Android
 * has no Sign in with Apple.
 */

function signsInWithApple(user: User | null): user is User {
  return !!user && user.providerData.some((p) => p.providerId === 'apple.com');
}

/**
 * The signed-in account signs in with Apple, and this site can ask Apple
 * about it (APPLE_SIGN_IN: Firebase's Apple provider has the web's Services ID
 * and key) — deleting it goes through Apple's window first.
 */
export function hasAppleToken(): boolean {
  return APPLE_SIGN_IN && signsInWithApple(getFirebaseClientAuth().currentUser);
}

/**
 * What became of the Apple token:
 * - `none`: there is none to revoke ({@link hasAppleToken} is false);
 * - `revoked`;
 * - `cancelled`: the person closed Apple's window — schedule nothing;
 * - `blocked`: the browser blocked the window — ask for another tap (Auth's
 *   frame has loaded by then, so the next one opens straight from the click);
 * - `failed`: anything else (logged). The deletion still goes ahead: it is
 *   what the person asked for, and Apple's side must never stand in its way.
 */
export type AppleRevocation = 'none' | 'revoked' | 'cancelled' | 'blocked' | 'failed';

function codeOf(err: unknown): unknown {
  return (err as { code?: unknown } | null)?.code;
}

/**
 * Revoke the account's Apple token before its deletion is asked for — before,
 * since the deletion revokes the account's sessions, and the revocation is
 * made with one. Apple's window asks the person to confirm (a fresh Apple
 * access token; Firebase refuses an Apple ID that isn't the account's), and
 * Firebase revokes that token with Apple. Call it straight from the click,
 * before any other await: a browser opens a popup only from one.
 */
export async function revokeAppleToken(locale?: string): Promise<AppleRevocation> {
  const auth = getFirebaseClientAuth();
  const user = auth.currentUser;
  if (!APPLE_SIGN_IN || !signsInWithApple(user)) return 'none';
  let accessToken: string | undefined;
  try {
    // Named explicitly: Auth may have been set up without a default resolver (client.ts).
    const result = await reauthenticateWithPopup(user, appleProvider(locale), browserPopupRedirectResolver);
    accessToken = OAuthProvider.credentialFromResult(result)?.accessToken;
  } catch (err) {
    if (signInFailure(err) === 'cancelled') return 'cancelled';
    if (codeOf(err) === 'auth/popup-blocked') return 'blocked';
    console.warn('[apple] confirming with Apple failed:', codeOf(err) ?? err);
    return 'failed';
  }
  if (!accessToken) {
    console.warn('[apple] Apple gave no access token to revoke');
    return 'failed';
  }
  try {
    await revokeAccessToken(auth, accessToken);
    return 'revoked';
  } catch (err) {
    console.warn('[apple] revoking the Apple token failed:', codeOf(err) ?? err);
    return 'failed';
  }
}
