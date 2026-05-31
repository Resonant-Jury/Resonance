import { setRequestLocale } from 'next-intl/server';
import { AppShell } from '@/components/providers/AppShell';

// No admin SDK on the hot path: middleware gates on the session-cookie's
// presence, and AppShell (client) resolves the viewer + handles the
// signin/signup redirects. App data is fetched client-direct from Firestore.
export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AppShell>{children}</AppShell>;
}
