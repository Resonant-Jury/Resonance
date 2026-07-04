import { useTranslations } from 'next-intl';
import { MiniStoryCard } from './MiniStoryCard';
import type { Card, User } from '@/lib/db/types';
import { anonymousByline } from '@/lib/adapters/story';
import { Link } from '@/i18n/navigation';
import styles from './MiniCardGrid.module.css';

export interface MiniCardGridProps {
  cards: Card[];
  authors: Record<string, User>;
}

/** Grid of simplified, clickable mini cards (image + title + author only). */
export function MiniCardGrid({ cards, authors }: MiniCardGridProps) {
  const t = useTranslations('card');
  return (
    <div data-card-grid className={styles.grid}>
      {cards.map((card, i) => {
        const author = authors[card.authorId];
        const byline = card.anonymous
          ? anonymousByline(card, t('anonymousAuthor'))
          : {
              author: author ? author.handle : '—',
              authorInitials: author?.initials ?? '?',
              avatarUrl: author?.avatarUrl,
              avatarSeed: author ? author.avatarSeed : undefined,
            };
        return (
          <Link
            key={card.id}
            href={`/card/${card.slug ?? card.id}`}
            className={styles.item}
            style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
          >
            <MiniStoryCard
              title={card.thoughtCore}
              author={byline.author}
              authorInitials={byline.authorInitials}
              authorAccent={card.anonymous ? undefined : author?.accentColor}
              authorSeed={byline.avatarSeed != null ? Number(byline.avatarSeed) : undefined}
              authorAvatarUrl={byline.avatarUrl}
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
