/**
 * Firebase App Check on the web, through Cloudflare Turnstile (a custom
 * provider): the browser solves an invisible Turnstile challenge, POSTs its
 * token to APP_CHECK_EXCHANGE_PATH, and the server — having asked Cloudflare
 * whether the token is good — mints an App Check token for the web app with
 * the Admin SDK. Firestore, Auth and our own /api/v1 calls then carry it.
 * The apps use Apple's App Attest and Google's Play Integrity instead.
 *
 * Monitoring only: Firestore and Auth are not enforced in the console, and
 * the API logs what it sees (lib/appCheck/server) without refusing anything.
 */

/** The Turnstile widget's site key (public: it is in every page). The widget is invisible. */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '0x4AAAAAAFLmj8Bq5kYcnuKA';

/** The action the browser names and the server insists on (Turnstile: ≤ 32 of [A-Za-z0-9_-]). */
export const TURNSTILE_ACTION = 'app-check';

/** Where the browser trades a Turnstile token for an App Check token. */
export const APP_CHECK_EXCHANGE_PATH = '/api/app-check';

/** How long a minted App Check token lasts (the Admin SDK allows 30 minutes to 7 days). */
export const APP_CHECK_TTL_MS = 12 * 60 * 60 * 1000;

/** The header Firebase's own SDKs use, and our API calls too. */
export const APP_CHECK_HEADER = 'X-Firebase-AppCheck';

/**
 * Whether a page at `origin` asks for App Check tokens: only the site's own
 * production origin (NEXT_PUBLIC_SITE_URL), which is where the Turnstile
 * widget is allowed to run — not previews, local builds or the emulators.
 */
export function appCheckRunsAt(
  origin: string,
  env: { NEXT_PUBLIC_SITE_URL?: string; NEXT_PUBLIC_FIREBASE_EMULATOR?: string; NEXT_PUBLIC_APP_CHECK?: string },
): boolean {
  if (env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true' || env.NEXT_PUBLIC_APP_CHECK === 'off' || !env.NEXT_PUBLIC_SITE_URL) return false;
  try {
    return new URL(env.NEXT_PUBLIC_SITE_URL).origin === origin;
  } catch {
    return false;
  }
}
