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

export function cardToStory(card: Card, author: Pick<User, 'handle' | 'initials' | 'avatarUrl' | 'avatarSeed'>): Story {
  const wordCount = card.story.replace(/\s+/g, '').length;
  const minutes = Math.max(1, Math.round(wordCount / 320));
  const excerpt = card.story.replace(/\n+/g, ' ').slice(0, 96) + (card.story.length > 96 ? '…' : '');
  return {
    title: card.thoughtCore,
    excerpt,
    author: author.handle,
    authorInitials: author.initials,
    avatarUrl: author.avatarUrl,
    avatarSeed: author.avatarSeed,
    readTime: `${minutes} min`,
    tags: card.tags,
    imageUrl: card.media?.url,
    imageLabel: card.media?.label ?? card.thoughtCore.slice(0, 24),
  };
}
