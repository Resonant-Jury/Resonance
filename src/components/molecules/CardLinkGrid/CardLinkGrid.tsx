'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
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
  /**
   * Show real bylines on the viewer's own anonymous cards (me-page card box
   * only — pair it with an explicit anonymous badge via `renderCaption`).
   */
  deanonymize?: boolean;
}

/**
 * Column count mirroring the grid's CSS breakpoints (640 / 1024). Resolves
 * only on the client — `null` during SSR/hydration, where the CSS-columns
 * fallback renders instead.
 */
function useFeedColumns(): number | null {
  const [cols, setCols] = useState<number | null>(null);
  useEffect(() => {
    const queries = [window.matchMedia('(min-width: 1024px)'), window.matchMedia('(min-width: 640px)')];
    const update = () => setCols(queries[0].matches ? 3 : queries[1].matches ? 2 : 1);
    update();
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return cols;
}

/**
 * The masonry feed. Cards fill left-to-right, wrapping to the next visual row
 * once a row is full — card `i` lives in column `i % n`, so「載入更多」appends
 * after the last card instead of reshuffling the columns (CSS `columns` is
 * column-major: it would pour everything top-to-bottom again). Before the
 * column count is known (SSR / first paint) a CSS-columns version renders so
 * the landing page still ships cards in its HTML.
 */
export function CardLinkGrid({ cards, authors, cardHref, renderActions, renderCaption, deanonymize }: CardLinkGridProps) {
  const t = useTranslations('card');
  const cols = useFeedColumns();

  const renderItem = (card: Card, i: number) => {
    const author = authors[card.authorId];
    const story = author
      ? cardToStory(card, author, { anonymousLabel: t('anonymousAuthor'), deanonymize })
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
  };

  if (cols === null) {
    return (
      <div data-card-grid className={styles.grid}>
        {cards.map(renderItem)}
      </div>
    );
  }

  return (
    <div data-card-grid className={styles.cols} style={{ '--feed-cols': cols } as React.CSSProperties}>
      {Array.from({ length: cols }, (_, c) => (
        <div key={c} className={styles.col}>
          {cards.map((card, i) => (i % cols === c ? renderItem(card, i) : null))}
        </div>
      ))}
    </div>
  );
}
