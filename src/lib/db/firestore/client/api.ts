'use client';

import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';

/** A failed /api/v1 call: the HTTP status and the body's `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Call the versioned API (/api/v1) from the browser, the way the apps do: the
 * signed-in user's Firebase ID token rides along as a Bearer token, so a call
 * made right after signing in never races the session cookie. JSON in, JSON
 * out; a non-2xx answer throws an ApiError.
 */
export async function callApi<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const user = getFirebaseClientAuth().currentUser;
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const json = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    throw new ApiError(res.status, json?.error?.code ?? 'error', json?.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}
