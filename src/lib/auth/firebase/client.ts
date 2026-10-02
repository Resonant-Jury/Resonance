'use client';

import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import { isNativeApp, signInWithAppleNative, signInWithGoogleNative } from './native';
import { startAppCheck } from './appCheck';
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
  const existing = getApps()[0];
  if (existing) return existing;
  const app = initializeApp(firebaseConfig());
  // Firestore and Auth pick App Check up whenever it starts (./appCheck).
  void startAppCheck(app);
  return app;
}

/** Local-emulator mode (`npm run dev:emulator`); see scripts/emulator-env.mjs. */
export const USE_FIREBASE_EMULATOR = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';
/** The emulators' ports (scripts/emulator-env.mjs; firebase/firebase.json's by default). */
export const EMULATOR_AUTH_PORT = Number(process.env.NEXT_PUBLIC_EMULATOR_AUTH_PORT || 9099);
export const EMULATOR_FIRESTORE_PORT = Number(process.env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT || 8080);

// --- the server session cookie ------------------------------------------------
//
// Only two things need the httpOnly `__session` cookie: the middleware, which
// sends /write, /me and /settings without one back to the sign-in page, and
// the /api routes a browser calls without a Bearer token. Everything else —
// Firestore reads, the UI knowing who is signed in — runs on the client SDK's
// own user. So the cookie is minted in the background, one request at a time,
// and only when it's missing or has under a day left. The browser can't read
// an httpOnly cookie, so when it expires is remembered here, beside it.

/** Where this browser remembers its session cookie (read before hydration too: see the card page). */
export const SESSION_MARK_KEY = 'resonance:session';
const DAY_MS = 24 * 60 * 60 * 1000;
/** The server's cookie lifetime when its answer doesn't say (FIREBASE_SESSION_EXPIRES_IN_DAYS' default). */
const DEFAULT_SESSION_MS = 7 * DAY_MS;
/** A cookie with less than this left is minted again. */
const REFRESH_WITHIN_MS = DAY_MS;
/** A cookie this close to expiry no longer counts as in place. */
const EXPIRY_SLACK_MS = 60 * 1000;

interface SessionMark {
  uid: string;
  /** Epoch ms the cookie expires at, by this browser's clock. */
  expiresAt: number;
}

function readSessionMark(): SessionMark | null {
  try {
    const raw = window.localStorage.getItem(SESSION_MARK_KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as Partial<SessionMark> | null;
    return typeof mark?.uid === 'string' && typeof mark.expiresAt === 'number'
      ? { uid: mark.uid, expiresAt: mark.expiresAt }
      : null;
  } catch {
    return null; // storage blocked (private mode, sandboxed frame) — treat as no cookie
  }
}

/**
 * Someone signed in in this browser, as far as it remembers — known at once,
 * before the SDK has restored its user. Pages that must not show something to
 * a signed-in viewer until they know who it is (the card page and the
 * viewer's blocks) hold it back on this.
 */
export function hasSessionMark(): boolean {
  return typeof window !== 'undefined' && readSessionMark() !== null;
}

function writeSessionMark(mark: SessionMark): void {
  try {
    window.localStorage.setItem(SESSION_MARK_KEY, JSON.stringify(mark));
  } catch {
    // Without storage every page load mints again — the old behaviour, still correct.
  }
}

function clearSessionMark(): void {
  try {
    window.localStorage.removeItem(SESSION_MARK_KEY);
  } catch {
    // nothing to clear
  }
}

function msLeft(uid: string): number {
  const mark = readSessionMark();
  return mark && mark.uid === uid ? mark.expiresAt - Date.now() : -Infinity;
}

/** The last cookie minted in this browser is this user's and is still valid. */
function sessionInPlace(uid: string): boolean {
  return msLeft(uid) > EXPIRY_SLACK_MS;
}

async function postSession(user: FirebaseUser): Promise<void> {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Unable to create session');
  // The route may say how long the cookie lives (`expiresIn`, ms); otherwise
  // assume the server's default lifetime.
  const body = (await res.json().catch(() => null)) as { expiresIn?: unknown } | null;
  const lifetime = typeof body?.expiresIn === 'number' && body.expiresIn > 0 ? body.expiresIn : DEFAULT_SESSION_MS;
  writeSessionMark({ uid: user.uid, expiresAt: Date.now() + lifetime });
}

let minting: { uid: string; promise: Promise<void> } | null = null;

/**
 * Make sure the session cookie is this user's and has over a day left,
 * minting a new one only when it doesn't. Concurrent callers share one
 * request. `force` mints regardless — an explicit sign-in always does.
 */
export function ensureSession(user: FirebaseUser, { force = false }: { force?: boolean } = {}): Promise<void> {
  if (minting?.uid === user.uid) return minting.promise;
  if (!force && msLeft(user.uid) > REFRESH_WITHIN_MS) return Promise.resolve();
  const promise: Promise<void> = postSession(user).finally(() => {
    if (minting?.promise === promise) minting = null;
  });
  minting = { uid: user.uid, promise };
  return promise;
}

/**
 * Settles once the session cookie is in place for whoever is signed in (or
 * its refresh failed). Await it before calling an /api route that reads the
 * cookie rather than a Bearer token.
 */
export function sessionSettled(): Promise<void> {
  return minting ? minting.promise.catch(() => undefined) : Promise.resolve();
}

/** What {@link FirebaseClientAuthProvider.subscribe} reports about the cookie with each user. */
export interface SessionState {
  /** The cookie is in place now (it may still be refreshing behind the scenes). */
  ready: boolean;
  /** Settles when any refresh started for this user has finished — also on failure. */
  settled: Promise<void>;
}

// --- the Auth instance ----------------------------------------------------------

/** Pages that open the Google / Apple sign-in popup. */
const SIGN_IN_PATH = /^\/(?:[A-Za-z-]+\/)?(?:signin|signup)(?:\/|$)/;

/**
 * Whether this page load should set Auth up with the popup resolver.
 *
 * On Safari and mobile browsers Firebase loads Google's gapi script and auth
 * iframe up front when it has the resolver, so a later signInWithPopup opens
 * its window straight from the click — load it lazily and Safari blocks the
 * popup. But that up-front load also holds back restoring the signed-in user
 * (and with it every Firestore read). So the resolver is set up where a popup
 * may follow: the sign-in pages, and for anyone not signed in in this browser
 * (a client-side navigation to the sign-in page keeps this Auth instance).
 * Signed-in readers elsewhere skip it; the shell apps sign in natively.
 */
function wantsPopupResolver(): boolean {
  if (typeof window === 'undefined') return true;
  if (isNativeApp()) return false;
  if (SIGN_IN_PATH.test(window.location.pathname)) return true;
  return readSessionMark() === null;
}

let clientAuth: Auth | null = null;
let authEmulatorConnected = false;

export function getFirebaseClientAuth(): Auth {
  if (clientAuth) return clientAuth;
  const app = getFirebaseClientApp();
  let auth: Auth;
  if (wantsPopupResolver()) {
    auth = getAuth(app); // the browser default: IndexedDB persistence + the popup resolver
  } else {
    try {
      auth = initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      });
    } catch {
      auth = getAuth(app); // already initialised (hot reload)
    }
  }
  if (USE_FIREBASE_EMULATOR && !authEmulatorConnected) {
    authEmulatorConnected = true;
    connectAuthEmulator(auth, `http://127.0.0.1:${EMULATOR_AUTH_PORT}`, { disableWarnings: true });
  }
  clientAuth = auth;
  return auth;
}

export function mapFirebaseUser(user: FirebaseUser): AuthUser {
  return {
    id: user.uid,
    email: user.email,
    phoneNumber: user.phoneNumber,
    emailVerified: user.emailVerified,
  };
}

/**
 * An explicit sign-in waits for its cookie: the sign-in page navigates on to
 * `next` right after, and the middleware turns /write, /me and /settings
 * away without one.
 */
async function signedIn(user: FirebaseUser): Promise<AuthUser> {
  await ensureSession(user, { force: true });
  return mapFirebaseUser(user);
}

export class FirebaseClientAuthProvider implements IAuthProvider {
  async signIn(input: SignInInput): Promise<AuthUser> {
    const cred = await signInWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    return signedIn(cred.user);
  }

  async signUp(input: SignUpInput): Promise<AuthUser> {
    const cred = await createUserWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    return signedIn(cred.user);
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
      // Named explicitly: Auth may have been set up without a default resolver.
      ({ user } = await signInWithPopup(getFirebaseClientAuth(), provider, browserPopupRedirectResolver));
    }
    return signedIn(user);
  }

  async signInWithApple(): Promise<AuthUser> {
    let user: FirebaseUser;
    if (isNativeApp()) {
      ({ user } = await signInWithAppleNative(getFirebaseClientAuth()));
    } else {
      // Web fallback; requires the Apple provider (Services ID) to be
      // configured in the Firebase console before it can succeed.
      ({ user } = await signInWithPopup(
        getFirebaseClientAuth(),
        new OAuthProvider('apple.com'),
        browserPopupRedirectResolver,
      ));
    }
    return signedIn(user);
  }

  /** Mint the session cookie again for whoever is signed in, and wait for it. */
  async refreshSession(): Promise<void> {
    const user = getFirebaseClientAuth().currentUser;
    if (user) await ensureSession(user, { force: true });
  }

  async signOut(): Promise<void> {
    // A cookie still being minted must not land after the DELETE below.
    await sessionSettled();
    clearSessionMark();
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
   * Subscribe to auth changes. The user is reported the moment the SDK knows
   * it; the session cookie is kept fresh behind it.
   *
   * The `__session` cookie has a fixed lifetime, while the SDK holds a
   * long-lived refresh token and rotates the ID token roughly hourly. Left
   * alone, the cookie would lapse while the SDK still considers the user
   * signed in — and protected routes would bounce them to /signin.
   * `onIdTokenChanged` fires on restore, on every token refresh and on
   * sign-out, and each tick re-mints the cookie once it has under a day left.
   *
   * @returns an unsubscribe function.
   */
  subscribe(onChange: (user: AuthUser | null, session: SessionState) => void): () => void {
    const auth = getFirebaseClientAuth();
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        clearSessionMark();
        onChange(null, { ready: true, settled: Promise.resolve() });
        return;
      }
      const ready = sessionInPlace(user.uid);
      // A failed refresh keeps the UI signed in; the next token tick (or a
      // reload) tries again.
      const settled = ensureSession(user).catch(() => undefined);
      onChange(mapFirebaseUser(user), { ready, settled });
    });
  }

  async currentSession(): Promise<AuthSession | null> {
    const user = await this.currentUser();
    return user ? { user, expiresAt: null } : null;
  }
}

export const firebaseClientAuthProvider = new FirebaseClientAuthProvider();
