/**
 * What search engines are shown (src/app/robots.ts, src/app/sitemap.ts).
 * Pages are logical paths, served under every locale (localePrefix: 'always').
 */

/** The policy pages, public in every locale. */
export const POLICY_PAGES = ['/privacy', '/terms', '/support', '/child-safety'] as const;

/** The signed-in app's pages: a crawler gets a sign-in redirect or an empty shell there. */
export const APP_PAGES = ['/home', '/me', '/settings', '/messages', '/write'] as const;

export const SITEMAP_PATH = '/sitemap.xml';

/**
 * At most this many cards in the sitemap, the newest first (each in both
 * locales). One regeneration reads this many card documents (a few fields
 * each), at most once an hour.
 */
export const SITEMAP_MAX_CARDS = 1000;

/** Only the production deployment is for search engines; previews and local builds keep them out entirely. */
export function indexable(env: Record<string, string | undefined> = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}
