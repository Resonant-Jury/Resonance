import { MiniStoryCard } from './MiniStoryCard';
import type { Card, User } from '@/lib/db/types';
import { Link } from '@/i18n/navigation';
import styles from './MiniCardGrid.module.css';

export interface MiniCardGridProps {
  cards: Card[];
  authors: Record<string, User>;
}

/** Grid of simplified, clickable mini cards (image + title + author only). */
export function MiniCardGrid({ cards, authors }: MiniCardGridProps) {
  return (
    <div data-card-grid className={styles.grid}>
      {cards.map((card, i) => {
        const author = authors[card.authorId];
        return (
          <Link
            key={card.id}
            href={`/card/${card.slug ?? card.id}`}
            className={styles.item}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <MiniStoryCard
              title={card.thoughtCore}
              author={author ? `@${author.handle}` : '—'}
              authorInitials={author?.initials ?? '?'}
              authorAccent={author?.accentColor}
              authorSeed={author ? Number(author.avatarSeed) : undefined}
              authorAvatarUrl={author?.avatarUrl}
              imageUrl={card.media?.url}
              imageLabel={card.media?.label ?? card.thoughtCore.slice(0, 24)}
              index={i}
              isLast={i === cards.length - 1}
            />
          </Link>
        );
      })}
    </div>
  );
}
