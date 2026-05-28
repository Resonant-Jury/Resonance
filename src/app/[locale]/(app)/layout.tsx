import { AppHeader, HEADER_TOTAL_H } from '@/components/sections/AppHeader/AppHeader';
import { FloatingWriteButton } from '@/components/sections/AppHeader/FloatingWriteButton';
import { repos } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { redirect } from '@/i18n/navigation';
import { setRequestLocale } from 'next-intl/server';

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
  if (!authUser) {
    redirect({ href: '/signin', locale });
    return null;
  }
  const [user, unreadCount] = await Promise.all([
    repos.user.getCurrent(),
    repos.notification.unreadCount(authUser.id),
  ]);
  if (!user) {
    redirect({ href: '/signup', locale });
    return null;
  }
  return (
    <>
      <AppHeader
        user={{ initials: user.initials, handle: user.handle, accentColor: user.accentColor }}
        unreadCount={unreadCount}
      />
      <main style={{ paddingTop: HEADER_TOTAL_H + 8, minHeight: '100vh' }}>{children}</main>
      <FloatingWriteButton />
    </>
  );
}
