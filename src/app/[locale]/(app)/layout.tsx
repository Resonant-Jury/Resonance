import { AppHeader } from '@/components/sections/AppHeader/AppHeader';
import { FloatingWriteButton } from '@/components/sections/AppHeader/FloatingWriteButton';
import { repos } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import { nextQuery } from '@/lib/auth/nextPath';

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const authUser = await getCurrentUser();
  const hdrs = await headers();
  const currentPath = hdrs.get('x-pathname');
  const nextSuffix = nextQuery(currentPath);
  if (!authUser) {
    redirect({ href: `/signin${nextSuffix}`, locale });
    return null;
  }
  const user = await repos.user.getCurrent();
  if (!user) {
    redirect({ href: `/signup${nextSuffix}`, locale });
    return null;
  }
  return (
    <>
      <AppHeader
        user={{ initials: user.initials, handle: user.handle, accentColor: user.accentColor }}
      />
      <main style={{ minHeight: '100vh' }}>{children}</main>
      <FloatingWriteButton />
    </>
  );
}
