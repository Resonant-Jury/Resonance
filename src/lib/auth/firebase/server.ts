import { cookies } from 'next/headers';
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

export async function verifySessionCookie(sessionCookie: string): Promise<AuthSession | null> {
  try {
    const token = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    return {
      user: mapToken(token),
      expiresAt: token.exp ? new Date(token.exp * 1000) : null,
    };
  } catch {
    return null;
  }
}

export async function getServerSession(): Promise<AuthSession | null> {
  const store = await cookies();
  const sessionCookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;
  return verifySessionCookie(sessionCookie);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getServerSession();
  return session?.user ?? null;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Authentication required');
  return user;
}
