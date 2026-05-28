import type { Card, User } from '@/lib/db/types';
import type { Story } from '@/components/molecules/StoryCard/StoryCard';

/**
 * Adapt a Card (domain) to the Story shape used by the existing StoryCard
 * molecule.  The MVP uses the story card for Card rendering so the visual
 * identity stays consistent across marketing + app pages.
 */
export function cardToStory(card: Card, author: Pick<User, 'handle' | 'initials'>): Story {
  const wordCount = card.story.replace(/\s+/g, '').length;
  const minutes = Math.max(1, Math.round(wordCount / 320));
  const excerpt = card.story.replace(/\n+/g, ' ').slice(0, 96) + (card.story.length > 96 ? '…' : '');
  return {
    title: card.thoughtCore,
    excerpt,
    author: `@${author.handle}`,
    authorInitials: author.initials,
    readTime: `${minutes} min`,
    tags: card.tags,
    imageUrl: card.media?.url,
    imageLabel: card.media?.label ?? card.thoughtCore.slice(0, 24),
  };
}
