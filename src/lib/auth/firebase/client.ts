'use client';

import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth';
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
  return getApps()[0] ?? initializeApp(firebaseConfig());
}

export function getFirebaseClientAuth() {
  return getAuth(getFirebaseClientApp());
}

export function mapFirebaseUser(user: FirebaseUser): AuthUser {
  return {
    id: user.uid,
    email: user.email,
    phoneNumber: user.phoneNumber,
    emailVerified: user.emailVerified,
  };
}

async function persistSession(user: FirebaseUser) {
  const idToken = await user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) throw new Error('Unable to create session');
}

export class FirebaseClientAuthProvider implements IAuthProvider {
  async signIn(input: SignInInput): Promise<AuthUser> {
    const cred = await signInWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    await persistSession(cred.user);
    return mapFirebaseUser(cred.user);
  }

  async signUp(input: SignUpInput): Promise<AuthUser> {
    const cred = await createUserWithEmailAndPassword(getFirebaseClientAuth(), input.email, input.password);
    await persistSession(cred.user);
    return mapFirebaseUser(cred.user);
  }

  async signInWithGoogle(): Promise<AuthUser> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(getFirebaseClientAuth(), provider);
    await persistSession(cred.user);
    return mapFirebaseUser(cred.user);
  }

  async signOut(): Promise<void> {
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

  async currentSession(): Promise<AuthSession | null> {
    const user = await this.currentUser();
    return user ? { user, expiresAt: null } : null;
  }
}

export const firebaseClientAuthProvider = new FirebaseClientAuthProvider();
