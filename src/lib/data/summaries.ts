import type { AuthorBody, CardListBody, FeedCardBody, ProfileBody } from '@/lib/api/v1/schemas';
import type { Card, User } from '@/lib/db/types';
import type { CardsWithAuthors } from './hooks';

/**
 * The web's shapes for what /api/v1 answers a signed-in page: its card
 * summaries (FeedCard) become the Cards and bylines the list components draw.
 *
 * A summary is not a card: it carries a plain-text excerpt instead of the
 * story, and no author at all on an anonymous card (the server never names
 * one — `authorId` stays empty). It is marked `summary`, so it is drawn as a
 * list entry (its excerpt and read time) and never seeds a card page.
 */

/** An Author (a summary's byline) as a web User — what a byline shows, nothing else. */
export function summaryAuthor(a: AuthorBody, extra: { bio?: string | null; joinedAt?: string } = {}): User {
  return {
    id: a.id,
    handle: a.handle,
    ...(extra.bio ? { bio: extra.bio } : {}),
    region: a.region ?? '',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: a.verified,
    phoneHash: '',
    avatarSeed: a.avatarSeed ?? '',
    ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}),
    initials: a.initials,
    accentColor: a.accentColor,
    joinedAt: extra.joinedAt ? new Date(extra.joinedAt) : new Date(0),
    handleChangedAt: new Date(0),
  };
}

/** A FeedCard as a web Card for the list components (see the module comment). */
export function summaryCard(c: FeedCardBody): Card {
  return {
    id: c.id,
    authorId: c.author?.id ?? '',
    ...(c.slug ? { slug: c.slug } : {}),
    thoughtCore: c.title,
    story: c.excerpt,
    tags: c.tags,
    ...(c.imageUrl ? { media: { type: 'image' as const, url: c.imageUrl, ...(c.imageLabel ? { label: c.imageLabel } : {}) } } : {}),
    originalLocale: 'en',
    translations: {},
    visibility: c.visibility,
    ...(c.referenceCardId ? { referenceCardId: c.referenceCardId } : {}),
    publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
    readCount: 0,
    resonanceCount: 0,
    inviteCount: 0,
    ...(c.accentHue != null ? { accentHue: c.accentHue } : {}),
    anonymous: c.anonymous,
    summary: { readMinutes: c.readMinutes },
  };
}

/** Summaries as cards plus their bylines; an anonymous card has none. */
export function summaryList(list: FeedCardBody[] | CardListBody | undefined): CardsWithAuthors {
  const items = Array.isArray(list) ? list : (list?.cards ?? []);
  const authors: Record<string, User> = {};
  for (const c of items) if (c.author && !authors[c.author.id]) authors[c.author.id] = summaryAuthor(c.author);
  return { cards: items.map(summaryCard), authors };
}

/** A Profile's person as a web User (its bio and join date included). */
export function profileUser(p: ProfileBody): User {
  return summaryAuthor(p.author, { bio: p.bio, joinedAt: p.joinedAt });
}
