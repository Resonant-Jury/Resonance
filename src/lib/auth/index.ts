import { CURRENT_USER_ID } from '@/lib/mock/data';
import type { AuthUser } from './types';
import { getCurrentUser as getFirebaseCurrentUser, requireUser as requireFirebaseUser } from './firebase/server';

export function usingMockAuth() {
  return (
    process.env.DATA_PROVIDER === 'mock' ||
    process.env.NEXT_PUBLIC_USE_MOCK === undefined ||
    process.env.NEXT_PUBLIC_USE_MOCK !== 'false'
  );
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (usingMockAuth()) {
    return {
      id: CURRENT_USER_ID,
      email: 'mock@resonance.local',
      phoneNumber: null,
      emailVerified: true,
    };
  }
  return getFirebaseCurrentUser();
}

export async function requireUser(): Promise<AuthUser> {
  if (usingMockAuth()) {
    return {
      id: CURRENT_USER_ID,
      email: 'mock@resonance.local',
      phoneNumber: null,
      emailVerified: true,
    };
  }
  return requireFirebaseUser();
}

export type * from './types';
export type * from './interfaces';
