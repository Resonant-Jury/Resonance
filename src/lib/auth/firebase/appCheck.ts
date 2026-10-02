'use client';

import type { FirebaseApp } from 'firebase/app';
import type { AppCheck } from 'firebase/app-check';
import {
  APP_CHECK_EXCHANGE_PATH,
  APP_CHECK_HEADER,
  TURNSTILE_ACTION,
  TURNSTILE_SITE_KEY,
  appCheckRunsAt,
} from '@/lib/appCheck/config';

/**
 * App Check in the browser (see lib/appCheck/config): a custom provider that
 * solves Cloudflare's invisible Turnstile challenge and trades its token at
 * our server for an App Check token. Firestore and Auth ask for one on their
 * own once it is started; our /api/v1 calls carry it when one is at hand.
 * The SDK keeps the token (IndexedDB) and refreshes it before it runs out,
 * so a challenge runs about twice a day, not per page.
 *
 * Nothing waits on a challenge (App Check is only watched for now): with a
 * token from an earlier visit still good, it starts at once; otherwise the
 * challenge runs when the page is idle, and App Check starts once its token
 * is in hand — reads before that simply go without one.
 */

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** An invisible challenge usually takes a second or two. */
const SOLVE_TIMEOUT_MS = 10_000;
/** Until when this browser's App Check token is good (epoch ms), as the last exchange said. */
export const TOKEN_UNTIL_KEY = 'resonance:appcheck-until';
/** A kept token this close to running out is treated as gone. */
const KEPT_MARGIN_MS = 5 * 60_000;
/** After a failure, no new challenge for this long, doubling each time up to BACKOFF_MAX_MS. */
const BACKOFF_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;
/** How long an API call waits for a token that isn't already at hand. */
const HEADER_WAIT_MS = 150;

interface TurnstileOptions {
  sitekey: string;
  action: string;
  callback: (token: string) => void;
  'error-callback': (code: string) => boolean | void;
  'timeout-callback': () => void;
  retry: 'never';
  'refresh-expired': 'never';
}

interface Turnstile {
  render(container: HTMLElement, options: TurnstileOptions): string | null | undefined;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let started: Promise<AppCheck | null> | null = null;
let script: Promise<Turnstile> | null = null;
let failures = 0;
let retryAt = 0;

/**
 * Start App Check for the app — on the site's own production origin only
 * (previews, local builds and the emulators go without). Answers the same
 * promise each time; null where it doesn't run or couldn't start.
 */
export function startAppCheck(app: FirebaseApp): Promise<AppCheck | null> {
  if (started) return started;
  const runs =
    typeof window !== 'undefined' &&
    appCheckRunsAt(window.location.origin, {
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_FIREBASE_EMULATOR: process.env.NEXT_PUBLIC_FIREBASE_EMULATOR,
      NEXT_PUBLIC_APP_CHECK: process.env.NEXT_PUBLIC_APP_CHECK,
    });
  if (!runs) return (started = Promise.resolve(null));
  started = (async () => {
    const { initializeAppCheck, CustomProvider } = await import('firebase/app-check');
    // The token this visit starts with, handed to the SDK on its first ask.
    let first: { token: string; expireTimeMillis: number } | null = null;
    if (!tokenKept()) {
      await idle();
      first = await exchangeTurnstileToken().catch(() => null);
    }
    return initializeAppCheck(app, {
      provider: new CustomProvider({
        getToken: () => {
          const token = first;
          first = null;
          return token ? Promise.resolve(token) : exchangeTurnstileToken();
        },
      }),
      isTokenAutoRefreshEnabled: true,
    });
  })().catch((e) => {
    console.warn('[appcheck] not started', e);
    return null;
  });
  return started;
}

/** Whether the SDK's own store should still hold a good token from an earlier visit. */
function tokenKept(): boolean {
  try {
    return Number(window.localStorage.getItem(TOKEN_UNTIL_KEY) ?? 0) > Date.now() + KEPT_MARGIN_MS;
  } catch {
    return false;
  }
}

/** When the page has a moment (the challenge loads a script and a frame). */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 3000 });
    else setTimeout(resolve, 0);
  });
}

/**
 * The header for one of our own API calls: the App Check token when one is
 * ready within a moment, else nothing — a call never waits on a challenge
 * (asking does start one, for the calls after it).
 */
export async function appCheckHeaders(): Promise<Record<string, string>> {
  const appCheck = started ? await started : null;
  if (!appCheck) return {};
  const { getToken } = await import('firebase/app-check');
  const token = getToken(appCheck, false).then(
    (result) => result.token,
    () => null,
  );
  const value = await Promise.race([token, new Promise<null>((resolve) => setTimeout(() => resolve(null), HEADER_WAIT_MS))]);
  return value ? { [APP_CHECK_HEADER]: value } : {};
}

/** The custom provider's getToken: a challenge, then the exchange. */
async function exchangeTurnstileToken(): Promise<{ token: string; expireTimeMillis: number }> {
  if (Date.now() < retryAt) throw new Error('App Check: waiting before another challenge');
  try {
    const turnstileToken = await solveTurnstile();
    const res = await fetch(APP_CHECK_EXCHANGE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: turnstileToken }),
      credentials: 'same-origin',
    });
    if (!res.ok) throw new Error(`App Check exchange answered ${res.status}`);
    const { token, ttlMillis } = (await res.json()) as { token: string; ttlMillis: number };
    failures = 0;
    retryAt = 0;
    const expireTimeMillis = Date.now() + ttlMillis;
    try {
      window.localStorage.setItem(TOKEN_UNTIL_KEY, String(expireTimeMillis));
    } catch {
      // No storage: the next visit solves a challenge first.
    }
    return { token, expireTimeMillis };
  } catch (e) {
    failures++;
    retryAt = Date.now() + Math.min(BACKOFF_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
    throw e;
  }
}

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = TURNSTILE_SCRIPT;
    el.async = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not start')));
    el.onerror = () => reject(new Error('Turnstile did not load'));
    document.head.appendChild(el);
  }).catch((e) => {
    script = null;
    throw e;
  });
  return script;
}

/** Run the invisible widget once, in a box of its own off screen; its token, or why not. */
async function solveTurnstile(): Promise<string> {
  const turnstile = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;';
    document.body.appendChild(box);
    // Set once render() answers; read when the widget is done.
    const widget: { id?: string | null } = {};
    const finish = () => {
      clearTimeout(timer);
      if (widget.id) {
        try {
          turnstile.remove(widget.id);
        } catch {
          // Already gone.
        }
      }
      box.remove();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Turnstile timed out'));
    }, SOLVE_TIMEOUT_MS);
    widget.id = turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      action: TURNSTILE_ACTION,
      callback: (token) => {
        finish();
        resolve(token);
      },
      'error-callback': (code) => {
        finish();
        reject(new Error(`Turnstile error ${code}`));
        return true;
      },
      'timeout-callback': () => {
        finish();
        reject(new Error('Turnstile challenge timed out'));
      },
      retry: 'never',
      'refresh-expired': 'never',
    });
  });
}

/** Start over (tests). */
export function resetAppCheckForTests(): void {
  started = null;
  script = null;
  failures = 0;
  retryAt = 0;
}
