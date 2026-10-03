import type { Card, CardMedia, LinkPreview, Locale, User } from '@/lib/db/types';
import { linkPreviewsOf } from '@/lib/links/previewShape';

/**
 * What the card page's server render hands the browser: the document id its
 * URL names, and — for a public, published card only — the card as a
 * signed-out reader sees it, so the story is in the HTML and the browser
 * reads nothing before showing it.
 *
 * This is viewer-independent and cached (ISR), and everything in it is
 * serialised into the page, so it carries a whitelist of fields, never a
 * document: nothing a card or profile gains later leaks by default, and an
 * anonymous card's author never leaves the server.
 */
export interface CardSeed {
  /**
   * The card's document id, whatever its visibility (an id reveals nothing:
   * the browser's read of it is what the rules gate), or null when the URL
   * names no card.
   */
  id: string | null;
  /** A public, published card's page content; null for anything else. */
  view: PublicCardView | null;
}

export interface PublicCardView {
  card: PublicCard;
  /** The byline — null on an anonymous card. */
  author: PublicAuthor | null;
}

export interface PublicCard {
  id: string;
  /** Empty on an anonymous card. */
  authorId: string;
  slug: string | null;
  thoughtCore: string;
  story: string;
  tags: string[];
  media: CardMedia | null;
  originalLocale: Locale;
  referenceCardId: string | null;
  /** ISO time. */
  publishedAt: string | null;
  resonanceCount: number;
  accentHue: number | null;
  anonymous: boolean;
  /**
   * The story's standalone links' previews, checked (lib/links/previewShape);
   * empty when none. Always written here — optional only because an answer of
   * GET /api/cards/view cached from an older deployment has none.
   */
  linkPreviews?: LinkPreview[];
}

/** What a byline shows, and nothing else of the profile. */
export interface PublicAuthor {
  id: string;
  handle: string;
  bio: string | null;
  region: string;
  verified: boolean;
  avatarSeed: string;
  avatarUrl: string | null;
  initials: string;
  accentColor: string;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length ? v : null);

function iso(d: Date | null | undefined): string | null {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function publicMedia(media: CardMedia | undefined): CardMedia | null {
  const url = str(media?.url);
  if (!media || !url) return null;
  const label = str(media.label);
  return { type: media.type === 'video' ? 'video' : 'image', url, ...(label ? { label } : {}) };
}

/**
 * The seed for a card page. `card` is passed only when a signed-out reader
 * may read it (public and published); `author` is its author's profile, and
 * is dropped for an anonymous card whatever the caller passed.
 */
export function toCardSeed(id: string | null, card: Card | null, author: User | null): CardSeed {
  if (!id || !card) return { id, view: null };
  const anonymous = card.anonymous === true;
  // A byline card whose author is gone renders as not found — the browser's own read decides.
  if (!anonymous && !author) return { id, view: null };
  return {
    id,
    view: {
      card: {
        id: card.id,
        authorId: anonymous ? '' : card.authorId,
        slug: str(card.slug),
        thoughtCore: String(card.thoughtCore ?? ''),
        story: String(card.story ?? ''),
        tags: Array.isArray(card.tags) ? card.tags.filter((t): t is string => typeof t === 'string') : [],
        media: publicMedia(card.media),
        originalLocale: card.originalLocale,
        referenceCardId: str(card.referenceCardId),
        publishedAt: iso(card.publishedAt),
        resonanceCount: Number(card.resonanceCount ?? 0) || 0,
        accentHue: typeof card.accentHue === 'number' && Number.isFinite(card.accentHue) ? card.accentHue : null,
        anonymous,
        // They name pages, never the author: an anonymous card keeps them too.
        linkPreviews: linkPreviewsOf(card.linkPreviews),
      },
      author:
        anonymous || !author
          ? null
          : {
              id: author.id,
              handle: String(author.handle ?? ''),
              bio: str(author.bio),
              region: String(author.region ?? ''),
              verified: author.verified === true,
              avatarSeed: String(author.avatarSeed ?? ''),
              avatarUrl: str(author.avatarUrl),
              initials: String(author.initials ?? ''),
              accentColor: String(author.accentColor ?? ''),
            },
    },
  };
}
