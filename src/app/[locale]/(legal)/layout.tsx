import { setRequestLocale } from 'next-intl/server';
import { SiteHeader } from '@/components/sections/SiteHeader/SiteHeader';
import { SiteFooter } from '@/components/sections/SiteFooter/SiteFooter';

/** Public policy pages (privacy, terms, support) share the landing page's header and footer. */
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
      <SiteFooter />
    </>
  );
}
