'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import type { Card, User } from '@/lib/db/types';
import { cardToStory } from '@/lib/adapters/story';
import { cardPalettes } from '@/lib/design/cardColours';
import { Link } from '@/i18n/navigation';
import { usePrefillCard } from '@/lib/data/cardPrefill';
import styles from './CardLinkGrid.module.css';

export interface CardLinkGridProps {
  cards: Card[];
  authors: Record<string, User>;
  /** Override the card link target (default: the card's detail page). */
  cardHref?: (card: Card) => string;
  /**
   * Owner-management affordance rendered over the card's top-right corner
   * (outside the Link, so its clicks never navigate). Hover-revealed on
   * pointer devices, always visible on touch. `palette` is the colour family
   * the card wears (CARD_HUES order), for a control that matches it.
   */
  renderActions?: (card: Card, index: number, palette: number) => ReactNode;
  /**
   * Optional caption rendered directly under a card (e.g. the recommender's
   * 「為什麼這篇可能對你有共鳴」line). Sits outside the Link so it doesn't
   * become part of the navigable card surface.
   */
  renderCaption?: (card: Card, index: number) => ReactNode;
  /**
   * System annotation shown inside the card as a hand-drawn blockquote
   * (e.g. the recommender's「因為…」reason). Return null/undefined to omit.
   */
  quoteFor?: (card: Card, index: number) => string | null | undefined;
  /**
   * The list starts right under the app bar (the home feed): on a phone the
   * first band's paper begins on the bar's pen line, with no rule of its own.
   */
  seamTop?: boolean;
}

/**
 * Column count mirroring the grid's CSS breakpoints (640 / 1024). Resolves
 * only on the client — `null` during SSR/hydration, where the CSS
 * fallback grid renders instead.
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
 * column count is known (SSR / first paint) a plain grid lays the cards out
 * the same way — card i in column i % n, by the CSS breakpoints — so the
 * landing page ships its cards in its HTML where they will stay.
 */
export function CardLinkGrid({ cards, authors, cardHref, renderActions, renderCaption, quoteFor, seamTop = false }: CardLinkGridProps) {
  const t = useTranslations('card');
  const cols = useFeedColumns();
  const prefill = usePrefillCard();
  // One colouring for every width (no card wears the family of the three
  // before it): the server's grid, one column and two or three alike.
  const palettes = useMemo(() => cardPalettes(cards.map((c) => c.accentHue)), [cards]);

  const renderItem = (card: Card, i: number) => {
    const author = authors[card.authorId];
    // An anonymous card needs no author: its byline is the anonymous one.
    const story = author || card.anonymous
      ? cardToStory(card, author, { anonymousLabel: t('anonymousAuthor') })
      : { title: card.thoughtCore, excerpt: '', author: '—', authorInitials: '?', readTime: '—', tags: card.tags };
    return (
      <div key={card.id} className={styles.item} style={{ position: 'relative' }}>
        <Link
          href={cardHref ? cardHref(card) : `/card/${card.slug ?? card.id}`}
          // The card page opens on what the list already has (see usePrefillCard).
          onClick={cardHref ? undefined : () => prefill(card, author)}
          style={{
            textDecoration: 'none',
            color: 'inherit',
            display: 'block',
          }}
        >
          <StoryCard
            story={story}
            index={i}
            palette={palettes[i]}
            isLast={i === cards.length - 1}
            isFirst={seamTop && i === 0}
            quote={quoteFor ? quoteFor(card, i) ?? undefined : undefined}
          />
        </Link>
        {renderActions && <div className={styles.actions}>{renderActions(card, i, palettes[i])}</div>}
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
