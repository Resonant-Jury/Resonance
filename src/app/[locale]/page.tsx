import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { HeroSection } from '@/components/sections/HeroSection/HeroSection';
import { CardFeedSection } from '@/components/sections/CardFeedSection/CardFeedSection';
import { CTASection } from '@/components/sections/CTASection/CTASection';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';
import { repos } from '@/lib/db';
import type { User } from '@/lib/db/types';

export const revalidate = 3600;

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const cards = await repos.card.findLatestPublishedFeed(6);
  const authorIds = Array.from(new Set(cards.map((c) => c.authorId)));
  const authorList = await Promise.all(authorIds.map((id) => repos.user.findById(id)));
  const authors: Record<string, User> = {};
  for (const u of authorList) if (u) authors[u.id] = u;

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
