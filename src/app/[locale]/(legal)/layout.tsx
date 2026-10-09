import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';

/**
 * Public policy pages (privacy, terms, support, child safety) share the
 * landing page's header and footer — without the footer's store badges: the
 * apps open these pages in an in-app browser, where the badges would offer
 * the app to someone using it.
 */
export default async function LegalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter edgeColor="var(--color-cream)" download={false} />
    </>
  );
}
