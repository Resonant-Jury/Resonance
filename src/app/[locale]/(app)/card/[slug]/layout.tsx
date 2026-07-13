import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { mapCard } from '@/lib/db/firestore/mapper';
import { FirestoreUserRepository } from '@/lib/db/firestore/user';
import type { Locale } from '@/lib/db/types';
import { buildCardMetadata } from '@/lib/og';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

// ISR: each card page (shell + share metadata) is rendered once on demand and
// served from the CDN cache. Freshness is event-driven, not polled: every
// mutation that can change the metadata (publish/edit in CardEditor,
// visibility/delete in CardActionsMenu) calls /api/revalidate for this card's
// path. The long interval below is only a self-healing backstop in case a
// best-effort revalidate call was dropped (offline, closed tab).
export const revalidate = 86400;

// No slugs at build time — an empty list opts the segment into on-demand
// static generation (without it, Next renders every request dynamically and
// the `revalidate` above never engages).
export function generateStaticParams(): { slug: string }[] {
  return [];
}

/**
 * Server-rendered <head> for a card page. The page component itself is a client
 * component (SWR-driven), so this sibling layout is where per-card Open Graph /
 * Twitter metadata lives.
 *
 * Privacy: we resolve the card with *no viewer*, so only `public` cards get
 * their real title/excerpt/image. Private or connections-only cards fall
 * through to the site-level default metadata — nothing leaks in the share card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const db = getAdminDb();

  // slug → doc (mirrors /api/cards/resolve: match on slug, fall back to id).
  let snap = null;
  const bySlug = await db.collection('cards').where('slug', '==', slug).limit(1).get();
  if (!bySlug.empty) {
    snap = bySlug.docs[0];
  } else {
    const byId = await db.collection('cards').doc(slug).get();
    if (byId.exists) snap = byId;
  }

  if (!snap) return {};

  const card = mapCard(snap.id, snap.data() ?? {});
  // Only public cards are shareable with real content.
  if (card.visibility !== 'public') return {};

  const author = card.anonymous ? null : await new FirestoreUserRepository().findById(card.authorId);
  const t = await getTranslations({ locale, namespace: 'card' });

  return buildCardMetadata({
    card,
    author,
    locale: locale as Locale,
    base: siteUrl(),
    anonymousLabel: t('anonymousAuthor'),
  });
}

export default function CardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
