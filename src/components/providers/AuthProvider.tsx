'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { USE_FIREBASE_EMULATOR, firebaseClientAuthProvider } from '@/lib/auth/firebase/client';
import type { AuthUser, SignInInput, SignUpInput } from '@/lib/auth/types';

interface AuthContextValue {
  user: AuthUser | null;
  /** True until the client SDK has restored (or ruled out) a signed-in user. */
  loading: boolean;
  /**
   * The server session cookie is in place for `user` (always true when signed
   * out). Only what reads that cookie waits for it — an /api route called
   * without a Bearer token; Firestore reads and the UI never do.
   */
  sessionReady: boolean;
  signIn(input: SignInInput): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  signInWithApple(): Promise<AuthUser>;
  /** Mint the session cookie again for the signed-in user, and wait for it. */
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    // Subscribe (rather than a one-shot read) so the UI tracks token refreshes
    // and sign-out across tabs. The user shows up as soon as the SDK has it;
    // the session cookie is refreshed behind it when it needs to be — see
    // FirebaseClientAuthProvider.subscribe.
    let tick = 0;
    const unsubscribe = firebaseClientAuthProvider.subscribe((next, session) => {
      const mine = ++tick;
      setUser(next);
      setLoading(false);
      if (session.ready) {
        setSessionReady(true);
        return;
      }
      setSessionReady(false);
      void session.settled.then(() => {
        if (mine === tick) setSessionReady(true);
      });
    });
    return unsubscribe;
  }, []);

  // Emulator builds only (`npm run dev:emulator`): the sign-in page offers
  // Google alone, so browser tests sign the seeded accounts in from devtools —
  // `await window.__emulatorSignIn(email, password)` (see scripts/seed-emulator.ts).
  useEffect(() => {
    if (!USE_FIREBASE_EMULATOR) return;
    const w = window as unknown as { __emulatorSignIn?: (email: string, password: string) => Promise<AuthUser> };
    w.__emulatorSignIn = async (email, password) => {
      const next = await firebaseClientAuthProvider.signIn({ email, password });
      setUser(next);
      return next;
    };
    return () => {
      delete w.__emulatorSignIn;
    };
  }, []);

  const refreshSession = useCallback(() => firebaseClientAuthProvider.refreshSession(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      sessionReady,
      refreshSession,
      async signIn(input) {
        const next = await firebaseClientAuthProvider.signIn(input);
        setUser(next);
        return next;
      },
      async signUp(input) {
        const next = await firebaseClientAuthProvider.signUp(input);
        setUser(next);
        return next;
      },
      async signInWithGoogle() {
        const next = await firebaseClientAuthProvider.signInWithGoogle();
        setUser(next);
        return next;
      },
      async signInWithApple() {
        const next = await firebaseClientAuthProvider.signInWithApple();
        setUser(next);
        return next;
      },
      async signOut() {
        await firebaseClientAuthProvider.signOut();
        setUser(null);
      },
    }),
    [loading, refreshSession, sessionReady, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
