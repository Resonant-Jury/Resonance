import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { APP_PAGES, POLICY_PAGES, SITEMAP_PATH, indexable } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

/**
 * /robots.txt. The public pages — the landing page, cards, profiles and the
 * policies — are open; the API and the signed-in app's pages are not, except
 * the share images under /api/og (link previews fetch them, and X's crawler
 * honours robots.txt). A preview or local build turns every crawler away.
 */
export default function robots(): MetadataRoute.Robots {
  if (!indexable()) return { rules: { userAgent: '*', disallow: '/' } };
  const inEveryLocale = (paths: readonly string[]) => routing.locales.flatMap((l) => paths.map((p) => `/${l}${p}`));
  return {
    rules: {
      userAgent: '*',
      allow: ['/', ...inEveryLocale(['/card/', '/u/', ...POLICY_PAGES]), '/api/og/'],
      disallow: ['/api/', ...inEveryLocale(APP_PAGES)],
    },
    sitemap: `${siteUrl()}${SITEMAP_PATH}`,
  };
}
