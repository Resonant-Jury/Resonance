import type { Metadata } from 'next';
import type { Card, Locale, User } from '@/lib/db/types';
import { plainExcerpt } from '@/lib/adapters/story';

/** Absolute-URL default share image (the platform cover). */
export const OG_COVER_PATH = '/og-cover.jpg';
export const OG_COVER_SIZE = { width: 2640, height: 1416 } as const;

/**
 * Localized view of a card for the share card: prefer the viewer-locale
 * translation, fall back to the original prose.
 */
function localizedCard(card: Card, locale: Locale) {
  const t = card.translations?.[locale];
  return {
    title: t?.thoughtCore || t?.title || card.thoughtCore,
    story: t?.story || card.story,
  };
}

/**
 * Build Open Graph / Twitter metadata for a single card page.
 *
 * Pure so it can be unit-tested without touching Firestore: the caller resolves
 * the card + author server-side (public cards only — never leak private ones)
 * and passes them in. `base` is the deployment origin from {@link siteUrl}.
 */
export function buildCardMetadata(opts: {
  card: Card;
  author: User | null;
  locale: Locale;
  base: string;
  anonymousLabel: string;
}): Metadata {
  const { card, author, locale, base, anonymousLabel } = opts;
  const { title, story } = localizedCard(card, locale);
  const description = plainExcerpt(story, 200);

  const byline = card.anonymous || !author ? anonymousLabel : author.handle;
  // Share thumbnail: the card's own image when it has one, else the platform cover.
  const image = card.media?.type === 'image' && card.media.url ? card.media.url : `${base}${OG_COVER_PATH}`;
  const url = card.slug ? `${base}/${locale}/card/${card.slug}` : undefined;

  return {
    title,
    description,
    alternates: url ? { canonical: url } : undefined,
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: 'Resonance',
      locale,
      images: [{ url: image, alt: title }],
      authors: card.anonymous || !author ? undefined : [byline],
      publishedTime: card.publishedAt ? new Date(card.publishedAt).toISOString() : undefined,
      tags: card.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

/**
 * Build Open Graph / Twitter metadata for a public profile page.
 *
 * Profiles are anonymous-readable, so there's nothing to gate here. The caller
 * resolves the user by handle and passes localized `title`/`description`
 * (the user's bio, or a fallback) in.
 *
 * Share thumbnail: the user's avatar when they have one — shown as a square
 * `summary` card so it isn't awkwardly cropped — otherwise the platform cover
 * as a wide `summary_large_image`.
 */
export function buildProfileMetadata(opts: {
  user: User;
  locale: Locale;
  base: string;
  title: string;
  description: string;
}): Metadata {
  const { user, locale, base, title, description } = opts;
  const hasAvatar = Boolean(user.avatarUrl);
  const image = hasAvatar ? user.avatarUrl! : `${base}${OG_COVER_PATH}`;
  const url = `${base}/${locale}/u/${encodeURIComponent(user.handle)}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'profile',
      title,
      description,
      url,
      siteName: 'Resonance',
      locale,
      username: user.handle,
      images: [{ url: image, alt: user.handle }],
    },
    twitter: {
      card: hasAvatar ? 'summary' : 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}
