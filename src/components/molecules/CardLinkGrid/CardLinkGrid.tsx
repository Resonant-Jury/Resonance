import type { ReactNode } from 'react';
import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import type { Card, User } from '@/lib/db/types';
import { cardToStory } from '@/lib/adapters/story';
import { Link } from '@/i18n/navigation';
import styles from './CardLinkGrid.module.css';

export interface CardLinkGridProps {
  cards: Card[];
  authors: Record<string, User>;
  /** Override the card link target (default: the card's detail page). */
  cardHref?: (card: Card) => string;
  /**
   * Owner-management affordance rendered over the card's top-right corner
   * (outside the Link, so its clicks never navigate). Hover-revealed on
   * pointer devices, always visible on touch.
   */
  renderActions?: (card: Card, index: number) => ReactNode;
  /**
   * Optional caption rendered directly under a card (e.g. the recommender's
   * 「為什麼這篇可能對你有共鳴」line). Sits outside the Link so it doesn't
   * become part of the navigable card surface.
   */
  renderCaption?: (card: Card, index: number) => ReactNode;
}

export function CardLinkGrid({ cards, authors, cardHref, renderActions, renderCaption }: CardLinkGridProps) {
  return (
    <div data-card-grid className={styles.grid}>
      {cards.map((card, i) => {
        const author = authors[card.authorId];
        const story = author
          ? cardToStory(card, author)
          : { title: card.thoughtCore, excerpt: '', author: '—', authorInitials: '?', readTime: '—', tags: card.tags };
        return (
          <div key={card.id} className={styles.item} style={{ position: 'relative' }}>
            <Link
              href={cardHref ? cardHref(card) : `/card/${card.slug ?? card.id}`}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                display: 'block',
              }}
            >
              <StoryCard story={story} index={i} isLast={i === cards.length - 1} />
            </Link>
            {renderActions && <div className={styles.actions}>{renderActions(card, i)}</div>}
            {renderCaption && <div className={styles.caption}>{renderCaption(card, i)}</div>}
          </div>
        );
      })}
    </div>
  );
}
