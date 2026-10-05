import type { Card, User } from '@/lib/db/types';
import type { Story } from '@/components/molecules/StoryCard/StoryCard';
import { excerpt, plainText } from '@/lib/markdown/plainText';
import { readMinutes } from '@/lib/readTime';

/**
 * Plain-text excerpt of a markdown story — markdown syntax and bare addresses
 * left out, by the same rules as the excerpts the server stores for lists
 * (lib/markdown/plainText) — so card surfaces (thought-map nodes, a shared
 * card in a thread, the og:description) can preview the prose itself.
 */
export function plainExcerpt(markdown: string, max = 80): string {
  return excerpt(plainText(markdown), max);
}

export interface CardToStoryOptions {
  /** Localized byline for anonymous cards (e.g.「匿名」/ "Anonymous"). */
  anonymousLabel?: string;
  /**
   * Show the real byline even when the card is anonymous — only for surfaces
   * where the viewer IS the author (the me-page card box), which mark the card
   * with an explicit anonymous badge instead.
   */
  deanonymize?: boolean;
}

/**
 * The placeholder byline for an anonymous card. Seeded from the card id so the
 * avatar wobble stays deterministic but carries no identity.
 */
export function anonymousByline(card: Card, label: string) {
  return {
    author: label,
    authorInitials: '·',
    avatarUrl: undefined,
    avatarSeed: String((card.id.charCodeAt(0) ?? 7) * 31),
  };
}

/**
 * Adapt a Card (domain) to the Story shape used by the existing StoryCard
 * molecule.  The MVP uses the story card for Card rendering so the visual
 * identity stays consistent across marketing + app pages.
 *
 * `author` may be missing only for an anonymous card shown anonymously — its
 * author is never fetched (see bylineAuthorIds in lib/data/hooks).
 */
export function cardToStory(
  card: Card,
  author: Pick<User, 'handle' | 'initials' | 'avatarUrl' | 'avatarSeed'> | null | undefined,
  opts?: CardToStoryOptions,
): Story {
  // A summary's story is only its excerpt: it brings the whole story's read time along.
  const minutes = card.summary?.readMinutes ?? readMinutes(card.story);
  // A summary's story is the server's excerpt already; a whole story is cut down the way the server cuts it.
  const shown = card.summary ? card.story : excerpt(plainText(card.story));
  const anonymized = (card.anonymous && !opts?.deanonymize) || !author;
  const byline = anonymized
    ? anonymousByline(card, opts?.anonymousLabel ?? '匿名')
    : {
        author: author.handle,
        authorInitials: author.initials,
        avatarUrl: author.avatarUrl,
        avatarSeed: author.avatarSeed,
      };
  return {
    title: card.thoughtCore,
    excerpt: shown,
    ...byline,
    readTime: `${minutes} min`,
    tags: card.tags,
    imageUrl: card.media?.url,
    imageLabel: card.media?.label ?? card.thoughtCore.slice(0, 24),
    accentHue: card.accentHue,
  };
}
