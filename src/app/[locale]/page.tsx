import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { HeroSection } from '@/components/sections/HeroSection/HeroSection';
import { CardFeedSection } from '@/components/sections/CardFeedSection/CardFeedSection';
import { CTASection } from '@/components/sections/CTASection/CTASection';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import { repos } from '@/lib/db';
import type { User } from '@/lib/db/types';
import { smartAppBanner } from '@/lib/appStores';
import { siteUrl } from '@/lib/site';

export const revalidate = 3600;

/** The rest of the head is the locale layout's; this public page also offers the iOS app. */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { itunes: smartAppBanner(`${siteUrl()}/${locale}`) };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Everything passed to the client below is serialized into this cached,
  // public HTML — so only what a card surface shows: no author for an
  // anonymous card (not even its uid), no recommendation internals, and of
  // each author only their byline.
  const cards = (await repos.card.findLatestPublishedFeed(6)).map(({ signature: _s, indexedAt: _i, ...card }) =>
    card.anonymous ? { ...card, authorId: '' } : card,
  );
  const authorIds = Array.from(new Set(cards.map((c) => c.authorId).filter(Boolean)));
  const authorList = await Promise.all(authorIds.map((id) => repos.user.findById(id)));
  const authors: Record<string, User> = {};
  for (const u of authorList) if (u) authors[u.id] = byline(u);

  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <CardFeedSection cards={cards} authors={authors} />
        <CTASection />
      </main>
      <SiteFooter />
    </>
  );
}

/** An author as a card's byline needs them. */
function byline(u: User): User {
  return {
    id: u.id,
    handle: u.handle,
    initials: u.initials,
    avatarUrl: u.avatarUrl,
    avatarSeed: u.avatarSeed,
    accentColor: u.accentColor,
    region: '',
    primaryLocale: u.primaryLocale,
    autoTranslateTo: [],
    verified: u.verified,
    phoneHash: '',
    joinedAt: new Date(0),
    handleChangedAt: new Date(0),
  };
}
