'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { USE_FIREBASE_EMULATOR, firebaseClientAuthProvider } from '@/lib/auth/firebase/client';
import type { AuthUser, SignInInput, SignUpInput } from '@/lib/auth/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn(input: SignInInput): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  signInWithApple(): Promise<AuthUser>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe (rather than a one-shot read) so the UI tracks token refreshes
    // and sign-out across tabs, and so the server session cookie is kept fresh
    // on every token tick — see FirebaseClientAuthProvider.subscribe.
    const unsubscribe = firebaseClientAuthProvider.subscribe((next) => {
      setUser(next);
      setLoading(false);
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
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
    [loading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
