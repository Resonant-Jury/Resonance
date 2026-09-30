import type { AuthUser } from './types';
import {
  getCurrentUser as getFirebaseCurrentUser,
  requireUser as requireFirebaseUser,
  type AuthOptions,
} from './firebase/server';

export type { AuthOptions, RevocationCheck } from './firebase/server';

export async function getCurrentUser(opts?: AuthOptions): Promise<AuthUser | null> {
  return getFirebaseCurrentUser(opts);
}

export async function requireUser(opts?: AuthOptions): Promise<AuthUser> {
  return requireFirebaseUser(opts);
}

export type * from './types';
export type * from './interfaces';
