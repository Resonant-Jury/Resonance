import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/lib/db/types';
import { buildCardMetadata } from '@/lib/og';
import { siteUrl } from '@/lib/site';
import { loadCard } from './cardPageData';

export const runtime = 'nodejs';

// ISR: each card page (share metadata, and a public card's story) is rendered
// once on demand and served from the CDN cache. Paths that make a card
// non-public, anonymous or gone revalidate it on the server, and the browser
// re-reads the card through the rules and replaces whatever the HTML showed
// — but a write no server sees (an older app build changing visibility or
// deleting straight through Firestore) would keep the old HTML up for as long
// as this lasts. Five minutes bounds that for crawlers and readers without
// JavaScript, and costs one server read per card per five minutes of traffic
// (an idle card costs nothing: regeneration happens on the next request —
// which still gets the old HTML, unless it is older than next.config's
// expireTime, a day: then that visit renders fresh).
export const revalidate = 300;

// No slugs at build time — an empty list opts the segment into on-demand
// static generation (without it, Next renders every request dynamically and
// the `revalidate` above never engages).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

/**
 * Server-rendered <head> for a card page, from the same server read as the
 * page body (loadCard: one read per render).
 *
 * Privacy: the card is read with *no viewer*, so only public, published cards
 * get their real title/excerpt/image. Private, connections-only and draft
 * cards fall through to the site-level default metadata — nothing leaks in
 * the share card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const loaded = await loadCard(slug);
  if (!loaded?.card) return {};

  const t = await getTranslations({ locale, namespace: 'card' });
  return buildCardMetadata({
    card: loaded.card,
    author: loaded.author,
    locale: locale as Locale,
    base: siteUrl(),
    anonymousLabel: t('anonymousAuthor'),
    storageBase: process.env.R2_PUBLIC_BASE,
  });
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
