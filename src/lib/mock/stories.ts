import type { Story } from '@/components/molecules/StoryCard/StoryCard';
import { CARDS, USERS } from './data';

export const STORIES: Story[] = CARDS.map((card) => {
  const author = USERS.find((u) => u.id === card.authorId);
  
  // Create a short excerpt from the story
  const firstParagraph = card.story.split('\n')[0];
  const excerpt = firstParagraph.length > 100 
    ? firstParagraph.slice(0, 97) + '...' 
    : firstParagraph;

  return {
    title: card.thoughtCore,
    excerpt,
    author: author?.handle || 'Unknown',
    authorInitials: author?.initials || '??',
    readTime: `${Math.ceil(card.story.length / 300)} min read`,
    tags: card.tags,
    imageUrl: card.media?.url,
    imageLabel: card.tags[1] ? `${card.tags[0]} · ${card.tags[1]}` : `${card.tags[0]} · illustration`,
  };
});


