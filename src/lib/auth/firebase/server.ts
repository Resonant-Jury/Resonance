import { cookies, headers } from 'next/headers';
import { getApps, initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { DecodedIdToken } from 'firebase-admin/auth';
import type { AuthSession, AuthUser } from '../types';

export const SESSION_COOKIE_NAME = process.env.FIREBASE_SESSION_COOKIE_NAME ?? '__session';

function privateKey() {
  return process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
}

function initAdmin() {
  if (getApps().length) return;

  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const key = privateKey();

  initializeApp(
    projectId && clientEmail && key
      ? { credential: cert({ projectId, clientEmail, privateKey: key }), projectId }
      : { credential: applicationDefault(), projectId }
  );
}

export function getAdminAuth() {
  initAdmin();
  return getAuth();
}

function mapToken(token: DecodedIdToken): AuthUser {
  return {
    id: token.uid,
    email: token.email ?? null,
    phoneNumber: token.phone_number ?? null,
    emailVerified: token.email_verified ?? false,
  };
}

export async function createSessionCookie(idToken: string) {
  const expiresIn =
    Number(process.env.FIREBASE_SESSION_EXPIRES_IN_DAYS ?? 7) * 24 * 60 * 60 * 1000;
  return getAdminAuth().createSessionCookie(idToken, { expiresIn });
}

/*
 * Revocation. A token's signature and expiry are checked locally (Google's
 * public keys, cached by firebase-admin). Whether the account has since been
 * disabled, or its sessions revoked, is a lookup at Firebase Auth: writes and
 * the account, upload and illustration routes make it on every request;
 * reads trust what this server instance last saw for up to
 * REVOCATION_CACHE_MS. So a revoked session can go on *reading* through an
 * instance that saw the account shortly before, for at most that long.
 */

/** How long an instance trusts an account's last-read sign-in state for reads. */
export const REVOCATION_CACHE_MS = 2 * 60_000;
/** Accounts remembered per instance (oldest dropped first). */
const MAX_REMEMBERED = 5_000;

/** 'live' asks Firebase Auth now; 'cached' may use this instance's answer from the last REVOCATION_CACHE_MS. */
export type RevocationCheck = 'live' | 'cached';

export interface AuthOptions {
  /** Default 'live'. Only reads opt into 'cached'. */
  revocation?: RevocationCheck;
}

interface AccountState {
  disabled: boolean;
  /** Tokens issued (signed in) before this are revoked (ms; 0 = never revoked). */
  validSince: number;
  readAt: number;
}

const remembered = new Map<string, AccountState>();
const lookups = new Map<string, Promise<AccountState>>();

/**
 * Firebase Auth (or the network to it) failed, as opposed to the credential
 * being bad: a 500, never "you are signed out".
 */
export class AuthUnavailableError extends Error {
  constructor(readonly cause: unknown) {
    super('Firebase Auth is unavailable');
  }
}

/** Whether an error from firebase-admin is the service's (or the network's) fault rather than the credential's. */
export function isAuthOutage(e: unknown): boolean {
  const code = typeof (e as { code?: unknown })?.code === 'string' ? (e as { code: string }).code : '';
  const message = e instanceof Error ? e.message : '';
  if (!code) return true; // not a Firebase error at all: a bug or a dropped connection
  if (code.startsWith('app/')) return true; // app/network-error, app/network-timeout, app/invalid-credential…
  if (code === 'auth/internal-error' || code === 'auth/quota-exceeded') return true; // the service's 5xx / 429
  // Fetching Google's public keys failed; firebase-admin reports it as an argument error.
  return /fetching public keys/i.test(message);
}

function remember(uid: string, state: AccountState) {
  remembered.delete(uid);
  remembered.set(uid, state);
  if (remembered.size > MAX_REMEMBERED) remembered.delete(remembered.keys().next().value!);
}

function lookUp(uid: string): Promise<AccountState> {
  const lookup: Promise<AccountState> = getAdminAuth()
    .getUser(uid)
    .then(
      (user) => {
        const state = {
          disabled: user.disabled,
          validSince: user.tokensValidAfterTime ? new Date(user.tokensValidAfterTime).getTime() : 0,
          readAt: Date.now(),
        };
        // Only if nothing forgot the account (a revocation) while this was in flight.
        if (lookups.get(uid) === lookup) {
          lookups.delete(uid);
          remember(uid, state);
        }
        return state;
      },
      (e: unknown) => {
        if (lookups.get(uid) === lookup) lookups.delete(uid);
        throw e;
      },
    );
  lookups.set(uid, lookup);
  return lookup;
}

async function accountState(uid: string, revocation: RevocationCheck): Promise<AccountState> {
  if (revocation === 'cached') {
    const known = remembered.get(uid);
    if (known && Date.now() - known.readAt < REVOCATION_CACHE_MS) return known;
    const inFlight = lookups.get(uid);
    if (inFlight) return inFlight;
  }
  return lookUp(uid);
}

/**
 * Drop what this instance remembers of an account's sign-in state — call
 * after revoking its sessions, so the revocation holds here at once.
 */
export function forgetAccountState(uid: string) {
  remembered.delete(uid);
  lookups.delete(uid);
}

/**
 * Sign every device of an account out: revokes its refresh tokens. No device
 * can mint a new ID token, so each is signed out when its current one
 * expires (within the hour). Until then the server refuses that token on
 * writes and the account routes at once, and on reads once an instance's
 * remembered state lapses (REVOCATION_CACHE_MS); Firestore itself, reached
 * from a device directly, accepts it until it expires.
 */
export async function revokeSessions(uid: string) {
  await getAdminAuth().revokeRefreshTokens(uid);
  forgetAccountState(uid);
}

/**
 * A verified token's user, or null when the credential is no good (expired,
 * forged, revoked, account disabled or deleted). Throws AuthUnavailableError
 * when Firebase Auth couldn't be asked.
 */
async function signedIn(verify: () => Promise<DecodedIdToken>, revocation: RevocationCheck): Promise<DecodedIdToken | null> {
  try {
    // Local: signature, expiry, audience (the emulator also checks revocation here).
    const token = await verify();
    const state = await accountState(token.uid, revocation);
    if (state.disabled) return null;
    // As firebase-admin's own check: a token from a sign-in before the revocation is revoked.
    if (token.auth_time * 1000 < state.validSince) return null;
    return token;
  } catch (e) {
    if (isAuthOutage(e)) throw new AuthUnavailableError(e);
    return null; // auth/user-not-found, a bad or expired token…
  }
}

export async function verifySessionCookie(sessionCookie: string, opts: AuthOptions = {}): Promise<AuthSession | null> {
  const token = await signedIn(() => getAdminAuth().verifySessionCookie(sessionCookie), opts.revocation ?? 'live');
  return token ? { user: mapToken(token), expiresAt: token.exp ? new Date(token.exp * 1000) : null } : null;
}

export async function getServerSession(opts: AuthOptions = {}): Promise<AuthSession | null> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionCookie(sessionCookie, opts);
}

/**
 * Verify a Firebase ID token sent as `Authorization: Bearer <token>` — how the
 * native apps authenticate (they have no session cookie). Revoked tokens are
 * rejected, as session cookies are (see "Revocation" above).
 */
export async function verifyBearerToken(authorization: string | null, opts: AuthOptions = {}): Promise<AuthUser | null> {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = await signedIn(() => getAdminAuth().verifyIdToken(authorization.slice(7)), opts.revocation ?? 'live');
  return token ? mapToken(token) : null;
}

/** The signed-in user, or null. Throws AuthUnavailableError when Firebase Auth couldn't be asked (a 500, not a 401). */
export async function getCurrentUser(opts: AuthOptions = {}): Promise<AuthUser | null> {
  const authorization = (await headers()).get('authorization');
  if (authorization) return verifyBearerToken(authorization, opts);
  const session = await getServerSession(opts);
  return session?.user ?? null;
}

export async function requireUser(opts: AuthOptions = {}): Promise<AuthUser> {
  const user = await getCurrentUser(opts);
  if (!user) throw new Error('Authentication required');
  return user;
}
