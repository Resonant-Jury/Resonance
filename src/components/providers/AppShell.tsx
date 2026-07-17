'use client';

import { useEffect } from 'react';
import { AppHeader } from '@/components/sections/AppHeader/AppHeader';
import { AppChromeProvider } from '@/components/providers/AppChrome';
import { FloatingWriteButton } from '@/components/sections/AppHeader/FloatingWriteButton';
import { useAuth } from '@/components/providers/AuthProvider';
import { useMyProfile } from '@/lib/data/hooks';
import { useRouter, usePathname } from '@/i18n/navigation';
import { nextQuery } from '@/lib/auth/nextPath';

const PLACEHOLDER_USER = {
  initials: '··',
  handle: '',
  accentColor: 'oklch(88% 0.08 55)',
};

// Routes a logged-out visitor may view (public cards & profiles). Everything
// else under (app) — writing, the card box, settings — still requires sign-in.
// Paths are locale-stripped (next-intl usePathname), e.g. "/home", "/card/abc".
const PUBLIC_PREFIXES = ['/home', '/card', '/u'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Client shell for the authenticated (app) area. Replaces the former
 * admin-SDK auth check in the server layout: middleware already gates on the
 * session-cookie's presence, so here we only resolve the viewer client-side
 * and route to /signin (no auth) or /signup (authed but no profile yet).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user: authUser, loading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!authUser) {
      // Logged-out visitors may stay on public routes; gate the rest.
      if (!isPublicPath(pathname)) router.replace(`/signin${nextQuery(pathname)}`);
      return;
    }
    // Authenticated but no profile document yet → finish onboarding.
    if (!profileLoading && profile === null) {
      router.replace('/signup');
    }
  }, [loading, authUser, profileLoading, profile, pathname, router]);

  // Full-bleed workspaces (the thought map and the draft editor beside it)
  // own the whole viewport: no header, no floating write button — each shows
  // its own top-left Back control instead.
  const bareChrome =
    pathname === '/me/thought-map' || pathname === '/write' || pathname.startsWith('/write/');

  const headerUser = profile
    ? {
        initials: profile.initials,
        handle: profile.handle,
        accentColor: profile.accentColor,
        avatarUrl: profile.avatarUrl,
        avatarSeed: profile.avatarSeed,
      }
    : PLACEHOLDER_USER;

  return (
    <AppChromeProvider>
      {!bareChrome && <AppHeader user={headerUser} signedIn={!!authUser} authReady={!loading} />}
      <main style={{ minHeight: '100vh' }}>{children}</main>
      {authUser && !bareChrome && <FloatingWriteButton />}
    </AppChromeProvider>
  );
}
