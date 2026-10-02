import type { MetadataRoute } from 'next';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { routing } from '@/i18n/routing';
import { properlyPublished } from '@/lib/api/v1/service';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { POLICY_PAGES, SITEMAP_MAX_CARDS } from '@/lib/seo';
import { siteUrl } from '@/lib/site';

// Built with the deployment, then again at most once an hour (on the next
// request after that, ISR). Paths that take a listable card out of public
// view drop it sooner (revalidateLocalized).
export const revalidate = 3600;

interface Listed {
  slug: string;
  lastModified: Date;
}

/**
 * The newest public, published cards that name no one as anonymous — what a
 * signed-out reader's card page shows with its story. Nothing else is
 * listed: the query asks for exactly these and each document is checked
 * again, so a card that is private, connections-only, anonymous, a draft,
 * stamped by hand (properlyPublished) or still without a slug never is.
 */
async function listedCards(db: Firestore): Promise<Listed[]> {
  const snap = await db
    .collection('cards')
    .where('visibility', '==', 'public')
    .where('anonymous', '==', false)
    .where('publishedAt', '!=', null)
    .orderBy('publishedAt', 'desc')
    .select('slug', 'visibility', 'anonymous', 'publishedAt', 'updatedAt')
    .limit(SITEMAP_MAX_CARDS)
    .get();
  const now = Date.now();
  return snap.docs.flatMap((d) => {
    const { slug, visibility, anonymous, publishedAt, updatedAt } = d.data();
    if (visibility !== 'public' || anonymous !== false || !properlyPublished(publishedAt, now)) return [];
    if (typeof slug !== 'string' || !slug) return [];
    // An edit's server stamp, when it is one; the author's own writes can put anything there.
    const edited = updatedAt instanceof Timestamp && updatedAt.toMillis() > publishedAt.toMillis() && updatedAt.toMillis() <= now;
    return [{ slug, lastModified: (edited ? updatedAt : publishedAt).toDate() }];
  });
}

/** A logical path in every locale, each naming the others (hreflang). */
function inEveryLocale(base: string, path: string, lastModified?: Date): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(routing.locales.map((l) => [l, `${base}/${l}${path}`]));
  return routing.locales.map((l) => ({ url: languages[l], ...(lastModified && { lastModified }), alternates: { languages } }));
}

/**
 * /sitemap.xml: the landing and policy pages, and the newest public cards
 * (SITEMAP_MAX_CARDS), by slug. Profiles aren't listed; crawlers find them
 * from the cards. If the cards can't be read, the pages go out alone (a
 * build isn't failed for it; the next regeneration tries again).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = ['', ...POLICY_PAGES].flatMap((path) => inEveryLocale(base, path));
  let cards: Listed[] = [];
  try {
    cards = await listedCards(getAdminDb());
  } catch (e) {
    console.error('sitemap: card read failed', e);
  }
  return [...pages, ...cards.flatMap((c) => inEveryLocale(base, `/card/${encodeURIComponent(c.slug)}`, c.lastModified))];
}
