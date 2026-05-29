import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import type { Card, User } from '@/lib/db/types';
import { cardToStory } from '@/lib/adapters/story';
import { Link } from '@/i18n/navigation';
import styles from './CardLinkGrid.module.css';

export interface CardLinkGridProps {
  cards: Card[];
  authors: Record<string, User>;
}

export function CardLinkGrid({ cards, authors }: CardLinkGridProps) {
  return (
    <div data-card-grid className={styles.grid}>
      {cards.map((card, i) => {
        const author = authors[card.authorId];
        const story = author
          ? cardToStory(card, author)
          : { title: card.thoughtCore, excerpt: '', author: '—', authorInitials: '?', readTime: '—', tags: card.tags };
        return (
          <Link
            key={card.id}
            href={`/card/${card.id}`}
            className={styles.item}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              display: 'block',
            }}
          >
            <StoryCard story={story} index={i} isLast={i === cards.length - 1} />
          </Link>
        );
      })}
    </div>
  );
}
