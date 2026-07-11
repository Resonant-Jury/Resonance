import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FirestoreUserRepository } from '@/lib/db/firestore/user';
import type { Locale } from '@/lib/db/types';
import { buildProfileMetadata } from '@/lib/og';
import { siteUrl } from '@/lib/site';

export const runtime = 'nodejs';

/**
 * Server-rendered <head> for a public profile page. The page component is a
 * client component (SWR-driven), so this sibling layout supplies the per-profile
 * Open Graph / Twitter metadata. Profiles are anonymous-readable, so there's
 * nothing to gate — a missing handle just falls back to the site defaults.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}): Promise<Metadata> {
  const { locale, handle: raw } = await params;
  // Route segments arrive percent-encoded (e.g. a CJK handle); decode before lookup.
  let handle = raw;
  try {
    handle = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }

  const user = await new FirestoreUserRepository().findByHandle(handle);
  if (!user) return {};

  const t = await getTranslations({ locale, namespace: 'profile' });
  const title = t('shareTitle', { handle: user.handle });
  // Prefer the user's own bio; fall back to a localized default.
  const description = user.bio?.trim() || t('shareDescription', { handle: user.handle });

  return buildProfileMetadata({
    user,
    locale: locale as Locale,
    base: siteUrl(),
    title,
    description,
  });
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
