import type { Metadata, Viewport } from 'next';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { NextIntlProvider } from '@/components/providers/NextIntlProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import TweaksPanel from '@/components/providers/TweaksPanel';
import { OG_COVER_PATH, OG_COVER_SIZE } from '@/lib/og';
import { siteUrl } from '@/lib/site';
import '@/styles/globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Matches the manifest theme_color / brand cream surface.
export const viewport: Viewport = {
  themeColor: '#faf2e9',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const base = siteUrl();
  const title = t('title');
  const description = t('description');

  return {
    metadataBase: new URL(base),
    title,
    description,
    applicationName: 'Resonance',
    appleWebApp: {
      capable: true,
      title: 'Resonance',
      statusBarStyle: 'default',
    },
    icons: {
      icon: [
        { url: '/icon.svg', type: 'image/svg+xml' },
        { url: '/icon.png', type: 'image/png', sizes: '512x512' },
      ],
      apple: '/apple-icon.png',
    },
    // Default share card (platform cover) — card pages override this per-card.
    openGraph: {
      type: 'website',
      title,
      description,
      url: `${base}/${locale}`,
      siteName: 'Resonance',
      locale,
      images: [{ url: OG_COVER_PATH, width: OG_COVER_SIZE.width, height: OG_COVER_SIZE.height, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_COVER_PATH],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as typeof routing.locales[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router has no pages/_document.js; this <head> font link is the
            correct global loading mechanism, so the page-custom-font rule doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;800&family=DM+Sans:wght@400;500;600;700&family=Noto+Serif+TC:wght@400;700;800&family=Noto+Sans+TC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body suppressHydrationWarning>
        <NextIntlProvider messages={messages} locale={locale}>
          <AuthProvider>{children}</AuthProvider>
          <TweaksPanel />
        </NextIntlProvider>
      </body>
    </html>
  );
}
