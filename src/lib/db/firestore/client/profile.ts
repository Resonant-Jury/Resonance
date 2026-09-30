'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { Locale } from '@/lib/db/types';
import type { MeBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { ApiError, callApi } from './api';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/**
 * What a pen name may never contain: it is the /u/{handle} and
 * /messages/{handle} path segment (the server's `Handle` schema refuses the
 * same). Inputs strip these as they are typed.
 */
export const HANDLE_FORBIDDEN = /[/?#\\\p{Cc}]/gu;

export async function getCurrentUserHandle(): Promise<string | null> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) return null;
  const snap = await getDoc(doc(getClientDb(), 'users', uid));
  if (!snap.exists()) return null;
  const handle = snap.data().handle;
  return typeof handle === 'string' ? handle : null;
}

/**
 * Whether a pen name is free — your own current one counts as free
 * (GET /api/v1/handles/{handle}, the apps' as-you-type check). A name the
 * server refuses outright (too short, a forbidden character) is not.
 */
export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const trimmed = handle.trim();
  if (trimmed.length < 2) return false;
  try {
    const res = await callApi<{ available: boolean }>(`/api/v1/handles/${encodeURIComponent(trimmed)}`);
    return res.available;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return false;
    throw err;
  }
}

/** The name was taken between checking and saving (the server's 409). */
export function isHandleTaken(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'conflict';
}

/**
 * Save profile fields. The pen name, bio, region and writing language go
 * through the server (PATCH /api/v1/me), which keeps pen names unique in the
 * same transaction as the write — the rules refuse a client-side rename. The
 * avatar and the translation languages name no one else and stay
 * client-side writes.
 */
export async function updateProfile(patch: {
  handle?: string;
  bio?: string;
  region?: string;
  primaryLocale?: Locale;
  autoTranslateTo?: Locale[];
  avatarUrl?: string;
}): Promise<void> {
  const uid = requireUid();
  const { autoTranslateTo, avatarUrl, ...server } = patch;
  if (Object.keys(server).length) {
    await callApi<MeBody>('/api/v1/me', { method: 'PATCH', body: server });
  }
  const local: Record<string, unknown> = {};
  if (autoTranslateTo !== undefined) local.autoTranslateTo = autoTranslateTo;
  if (avatarUrl !== undefined) local.avatarUrl = avatarUrl;
  if (Object.keys(local).length) await setDoc(doc(getClientDb(), 'users', uid), local, { merge: true });
}

/**
 * Onboarding: create the signed-in account's profile (POST /api/v1/me — the
 * same call the apps make). Idempotent: an account that already has a
 * profile gets it back unchanged. Throws an ApiError with code "conflict"
 * when the pen name was taken meanwhile (see isHandleTaken).
 */
export async function createCurrentUserProfile(input: {
  handle: string;
  region: string;
  primaryLocale: Locale;
}): Promise<MeBody> {
  requireUid();
  return callApi<MeBody>('/api/v1/me', { method: 'POST', body: input });
}
