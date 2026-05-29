import type { AuthUser } from './types';
import { getCurrentUser as getFirebaseCurrentUser, requireUser as requireFirebaseUser } from './firebase/server';

export async function getCurrentUser(): Promise<AuthUser | null> {
  return getFirebaseCurrentUser();
}

export async function requireUser(): Promise<AuthUser> {
  return requireFirebaseUser();
}

export type * from './types';
export type * from './interfaces';
