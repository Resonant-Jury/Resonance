import { revalidatePath } from 'next/cache';
import { routing } from '@/i18n/routing';

/**
 * The server's side of keeping the ISR pages honest: a card page or a profile
 * cached as it was must be dropped the moment it would show something that is
 * no longer public — made private or anonymous, deleted, purged with its
 * account. Paths here are logical (`/card/x`); pages live under every locale
 * (localePrefix: 'always'), so each is revalidated once per locale.
 */

/** A logical path in every locale (`/card/x` → `/en/card/x`, `/zh-TW/card/x`; `/` → `/en`, `/zh-TW`). */
export function localizedPaths(paths: Iterable<string>): string[] {
  const out = new Set<string>();
  for (const path of paths) for (const locale of routing.locales) out.add(`/${locale}${path === '/' ? '' : path}`);
  return [...out];
}

/** Revalidate logical paths in every locale; answers the localized paths. */
export function revalidateLocalized(paths: Iterable<string>): string[] {
  const localized = localizedPaths(paths);
  for (const path of localized) revalidatePath(path);
  return localized;
}

/** Where a card's page is cached: under its id, and under its slug when it has one. */
export function cardPagePaths(card: { id: string; slug?: string | null }): string[] {
  return [...new Set([`/card/${card.id}`, ...(card.slug ? [`/card/${card.slug}`] : [])])];
}

/**
 * The landing page (`/`), when the card could be on it: its cached HTML
 * lists the latest published public cards, bylines and all. Pass the card as
 * it was and as it is now; either being listable names it.
 */
export function landingPagePaths(...states: ({ visibility?: unknown; publishedAt?: unknown } | null | undefined)[]): string[] {
  return states.some((s) => s?.visibility === 'public' && s.publishedAt != null) ? ['/'] : [];
}

/** Where a profile is cached: /u/{pen name}, as written and percent-encoded (a pen name may be in any script). */
export function profilePagePaths(handle: unknown): string[] {
  if (typeof handle !== 'string' || !handle) return [];
  return [...new Set([`/u/${handle}`, `/u/${encodeURIComponent(handle)}`])];
}
