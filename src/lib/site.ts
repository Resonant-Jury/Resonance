/**
 * The canonical origin of the deployment, used to build absolute URLs for
 * Open Graph / Twitter cards and the PWA manifest.
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_SITE_URL` — set this to the production domain (e.g. a custom
 *     domain) when one exists; it wins everywhere including local dev.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel injects the stable production
 *     host at build/runtime, so production OG links resolve correctly without
 *     any manual config.
 *  3. `http://localhost:3000` — local fallback.
 *
 * Returns a URL with no trailing slash.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return 'http://localhost:3000';
}
