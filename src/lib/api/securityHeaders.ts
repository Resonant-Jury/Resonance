/**
 * The response headers every page and route is served with (next.config.ts
 * `headers()`, evaluated at build time). Imported by next.config.ts, so
 * relative imports only.
 *
 * Enforced: the site can't be framed by another origin (clickjacking on
 * delete account, publish, block — X-Frame-Options and CSP frame-ancestors,
 * 'self' rather than none so a Firebase auth handler proxied onto our own
 * domain can still be framed by our pages), no MIME sniffing, a referrer
 * that never carries a path off-site, and no access to devices the site
 * doesn't use.
 *
 * Reported, not enforced: a Content-Security-Policy listing what the site
 * really loads. Browsers POST what it would have blocked to
 * /api/csp-report, which logs a trimmed copy. Watch those logs (Vercel →
 * Logs, `[csp]`) across sign-in (Google, Apple, email), the editor (image
 * upload and generation), cards, profiles and messages, on desktop and
 * phone, before moving the policy to `Content-Security-Policy`.
 */

/** The environment the policy is built from (process.env at build time). */
export interface SecurityEnv {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  R2_PUBLIC_BASE?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_EMULATOR?: string;
  NEXT_PUBLIC_EMULATOR_AUTH_PORT?: string;
  NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT?: string;
  NEXT_PUBLIC_ENABLE_PHONE_OTP?: string;
}

/** Where browsers send what the report-only policy would have blocked. */
export const CSP_REPORT_PATH = '/api/csp-report';

export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'hid=()',
  'bluetooth=()',
  'browsing-topics=()',
].join(', ');

function origin(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** The Content-Security-Policy the site is meant to keep to, as reported (not yet enforced). */
export function reportOnlyPolicy(env: SecurityEnv): string {
  const images = origin(env.R2_PUBLIC_BASE);
  const authDomain = env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ? `https://${env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}` : 'https://*.firebaseapp.com';
  // A local build against the emulators (npm run dev:emulator): Auth's (which also serves the sign-in iframe) and Firestore's.
  const emulated = env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';
  const authEmulator = emulated ? `http://127.0.0.1:${env.NEXT_PUBLIC_EMULATOR_AUTH_PORT || '9099'}` : null;
  const firestoreEmulator = emulated ? `http://127.0.0.1:${env.NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT || '8080'}` : null;
  // Phone sign-in (behind its flag) runs reCAPTCHA.
  const recaptcha = env.NEXT_PUBLIC_ENABLE_PHONE_OTP === 'true';
  // Vercel's toolbar on preview deployments.
  const preview = env.VERCEL_ENV === 'preview';
  const dev = env.NODE_ENV !== 'production';

  const directives: Record<string, (string | null | false)[]> = {
    'default-src': ["'self'"],
    // No nonces: the pages are static (ISR), so Next's inline bootstrap
    // scripts need 'unsafe-inline'. Firebase Auth's popup loads gapi; App
    // Check's Turnstile challenge (lib/auth/firebase/appCheck) its script.
    'script-src': [
      "'self'",
      "'unsafe-inline'",
      dev && "'unsafe-eval'", // React Refresh in `next dev`
      'https://apis.google.com',
      'https://challenges.cloudflare.com',
      recaptcha && 'https://www.google.com',
      recaptcha && 'https://www.gstatic.com',
      preview && 'https://vercel.live',
    ],
    'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', preview && 'https://vercel.live'],
    'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', preview && 'https://vercel.live', preview && 'https://assets.vercel.com'],
    // Stored pictures; the editor's generation previews are data: URLs.
    'img-src': ["'self'", 'data:', 'blob:', images, preview && 'https://vercel.live', preview && 'https://vercel.com'],
    'media-src': ["'self'", 'blob:', images],
    // Firestore, Firebase Auth (sign-in, token refresh, the popup's project config).
    'connect-src': [
      "'self'",
      'https://firestore.googleapis.com',
      'https://identitytoolkit.googleapis.com',
      'https://securetoken.googleapis.com',
      'https://www.googleapis.com',
      'https://apis.google.com',
      authEmulator,
      firestoreEmulator,
      preview && 'https://vercel.live',
      preview && 'wss://ws-us3.pusher.com',
    ],
    // Firebase Auth's hidden iframe (and the emulator's), gapi, Turnstile, reCAPTCHA.
    'frame-src': [
      "'self'",
      authDomain,
      'https://apis.google.com',
      'https://challenges.cloudflare.com',
      authEmulator,
      recaptcha && 'https://www.google.com',
      recaptcha && 'https://recaptcha.google.com',
      preview && 'https://vercel.live',
    ],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'report-uri': [CSP_REPORT_PATH],
  };
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...sources.filter(Boolean)].join(' '))
    .join('; ');
}

export function securityHeaders(env: SecurityEnv): { key: string; value: string }[] {
  return [
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
    { key: 'Content-Security-Policy-Report-Only', value: reportOnlyPolicy(env) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: PERMISSIONS_POLICY },
  ];
}
