import type { Metadata } from 'next';
import type { Card, Locale, User } from '@/lib/db/types';
import { plainExcerpt } from '@/lib/adapters/story';
import { storageKeyOf } from '@/lib/storage/publicUrl';

/** Absolute-URL default share image (the platform cover). */
export const OG_COVER_PATH = '/og-cover.jpg';
export const OG_COVER_SIZE = { width: 2640, height: 1416 } as const;

/**
 * A short tag for a picture's URL (FNV-1a, twice): the share image's URL
 * carries it, so a new cover or photo is a new URL no cache answers from
 * the old one.
 */
export function imageVersion(url: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ url.length;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x0100019d) >>> 0;
  }
  return a.toString(36) + b.toString(36);
}

/**
 * The share image for one of our stored pictures: a JPEG made from it by
 * /api/og/{kind}/{id} — stored pictures are AVIF or WebP, which some
 * platforms can't show. A picture hosted elsewhere is shared as it is.
 */
function shareImage(base: string, kind: 'card' | 'user', id: string, url: string, storageBase: string | undefined): string {
  if (!storageKeyOf(url, storageBase)) return url;
  return `${base}/api/og/${kind}/${encodeURIComponent(id)}?v=${imageVersion(url)}`;
}

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
  /** R2_PUBLIC_BASE: where our stored pictures are served from. */
  storageBase?: string;
}): Metadata {
  const { card, author, locale, base, anonymousLabel, storageBase } = opts;
  const { title, story } = localizedCard(card, locale);
  const description = plainExcerpt(story, 200);

  const byline = card.anonymous || !author ? anonymousLabel : author.handle;
  // Share thumbnail: the card's own image when it has one (as a JPEG), else the platform cover.
  const image =
    card.media?.type === 'image' && card.media.url
      ? shareImage(base, 'card', card.id, card.media.url, storageBase)
      : `${base}${OG_COVER_PATH}`;
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
  /** R2_PUBLIC_BASE: where our stored pictures are served from. */
  storageBase?: string;
}): Metadata {
  const { user, locale, base, title, description, storageBase } = opts;
  const hasAvatar = Boolean(user.avatarUrl);
  const image = hasAvatar ? shareImage(base, 'user', user.id, user.avatarUrl!, storageBase) : `${base}${OG_COVER_PATH}`;
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
