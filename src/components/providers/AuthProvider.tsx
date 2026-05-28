'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { firebaseClientAuthProvider } from '@/lib/auth/firebase/client';
import type { AuthUser, SignInInput, SignUpInput } from '@/lib/auth/types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn(input: SignInInput): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signInWithGoogle(): Promise<AuthUser>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    firebaseClientAuthProvider
      .currentUser()
      .then((current) => {
        if (alive) setUser(current);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
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
