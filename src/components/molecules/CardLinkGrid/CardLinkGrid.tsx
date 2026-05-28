import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import type { Card, User } from '@/lib/db/types';
import { cardToStory } from '@/lib/mock/adapters';
import { Link } from '@/i18n/navigation';

export interface CardLinkGridProps {
  cards: Card[];
  authors: Record<string, User>;
}

export function CardLinkGrid({ cards, authors }: CardLinkGridProps) {
  return (
    <div
      data-card-grid
      style={{
        columns: '240px',
        columnGap: 24,
      }}
    >
      {cards.map((card, i) => {
        const author = authors[card.authorId];
        const story = author
          ? cardToStory(card, author)
          : { title: card.thoughtCore, excerpt: '', author: '—', authorInitials: '?', readTime: '—', tags: card.tags };
        return (
          <Link
            key={card.id}
            href={`/card/${card.id}`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
              breakInside: 'avoid',
              marginBottom: 24,
            }}
          >
            <StoryCard story={story} index={i} isLast={i === cards.length - 1} />
          </Link>
        );
      })}
    </div>
  );
}
