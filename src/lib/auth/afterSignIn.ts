'use client';

import { getCurrentUserHandle } from '@/lib/db/firestore/client/profile';
import { sanitizeNextPath } from './nextPath';

/** The sign-up's `step` for an account that is signed in and needs its profile. */
export const PROFILE_STEP = 'profile';

/** The query of the sign-up's profile step, carrying `next` (a site path) when there is one. */
export function signupProfileQuery(next: string | null | undefined): string {
  const params = new URLSearchParams({ step: PROFILE_STEP });
  const safe = sanitizeNextPath(next);
  if (safe) params.set('next', safe);
  return `?${params}`;
}

/** The sign-up's profile step in `locale`, carrying `next`. */
export function signupProfilePath(locale: string, next: string | null | undefined): string {
  return `/${locale}/signup${signupProfileQuery(next)}`;
}

/**
 * Where a reader who has just signed in goes: an account without a pen name
 * yet (a first sign-in) straight to the sign-up's profile step, carrying
 * `next`; any other to `next`, else the feed. Asked here rather than left to
 * the app's shell, which would first open the feed and then step to sign-up —
 * a page and a hop for nothing. Unknown (the read failed): `next`, and the
 * shell still sends a nameless account to sign-up.
 */
export async function destinationAfterSignIn(locale: string, next: string | null): Promise<string> {
  const target = sanitizeNextPath(next) ?? `/${locale}/home`;
  try {
    const handle = await getCurrentUserHandle();
    if (needsProfile(handle)) return signupProfilePath(locale, next);
  } catch {
    // Fall through: the shell checks again.
  }
  return target;
}

/** Whether a reader with this pen name (or none) still has the sign-up's profile step ahead. */
export function needsProfile(handle: string | null | undefined): boolean {
  return !handle?.trim();
}

/** The sign-in and sign-up pages, by path (with or without the locale). */
const AUTH_PAGE = /^(\/(en|zh-TW))?\/(signin|signup)(\/|$)/;

/** Whether a URL (absolute, or a path) is one of the sign-in pages of this site. */
export function isAuthPage(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin && AUTH_PAGE.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Open `path` in place of this page, which leaves the tab's history: no way
 * back (the browser's back, the writer's Leave) lands on it again. The sign-in
 * and sign-up pages leave this way when they are done.
 */
export function replacePage(path: string): void {
  window.location.replace(path);
}

/** The writer's `from` when the sign-up opened it for a new account's first card. */
export const FROM_SIGNUP = 'signup';

/**
 * Where the sign-up goes when it is done: `path` as it is, or — the writer, a
 * new account's first card — marked `from=signup`, so the writer's way out
 * opens the feed rather than stepping back (useLeaveWriter).
 */
export function afterSignupPath(path: string): string {
  const url = new URL(path, 'https://same-site.invalid');
  if (!/^(\/(en|zh-TW))?\/write(\/|$)/.test(url.pathname)) return path;
  url.searchParams.set('from', FROM_SIGNUP);
  return url.pathname + url.search + url.hash;
}
