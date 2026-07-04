import type { Card, User } from '@/lib/db/types';
import type { Story } from '@/components/molecules/StoryCard/StoryCard';

/**
 * Adapt a Card (domain) to the Story shape used by the existing StoryCard
 * molecule.  The MVP uses the story card for Card rendering so the visual
 * identity stays consistent across marketing + app pages.
 */
/**
 * Plain-text excerpt of a markdown story — markdown syntax stripped so card
 * surfaces (e.g. thought-map nodes) can preview the prose itself.
 */
export function plainExcerpt(markdown: string, max = 80): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_~`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
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

export function cardToStory(
  card: Card,
  author: Pick<User, 'handle' | 'initials' | 'avatarUrl' | 'avatarSeed'>,
  opts?: CardToStoryOptions,
): Story {
  const wordCount = card.story.replace(/\s+/g, '').length;
  const minutes = Math.max(1, Math.round(wordCount / 320));
  const excerpt = card.story.replace(/\n+/g, ' ').slice(0, 96) + (card.story.length > 96 ? '…' : '');
  const anonymized = card.anonymous && !opts?.deanonymize;
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
    excerpt,
    ...byline,
    readTime: `${minutes} min`,
    tags: card.tags,
    imageUrl: card.media?.url,
    imageLabel: card.media?.label ?? card.thoughtCore.slice(0, 24),
  };
}
