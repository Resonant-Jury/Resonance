'use client';

import { useTranslations } from 'next-intl';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { useReferencedCard, useResonanceCards } from '@/lib/data/hooks';
import type { Card, User } from '@/lib/db/types';
import styles from './ResonanceCards.module.css';

export interface ResonanceCardsProps {
  card: Card;
}

/**
 * The resonance relationships around a card, rendered as clean centered sections
 * (matching the home page's section rhythm) rather than a framed, tinted block.
 *
 * Resonance is bidirectional:
 *  - **Source** — if this card is itself a response (`referenceCardId` set), link
 *    back up to the original it resonates from.
 *  - **Incoming** — every public card that resonates with (references) this one.
 *
 * Each side renders as simplified {@link MiniCardGrid} cards. Renders nothing
 * when neither side has anything to show.
 */
export function ResonanceCards({ card }: ResonanceCardsProps) {
  const t = useTranslations('card');
  const incoming = useResonanceCards(card.id);
  const source = useReferencedCard(card.referenceCardId);

  const incomingCards = incoming.data?.cards ?? [];
  const sourceCards = source.data?.cards ?? [];

  // Combine and de-duplicate in case there are overlapping references
  const seen = new Set<string>();
  const mergedCards: Card[] = [];
  const mergedAuthors: Record<string, User> = {};

  for (const c of [...sourceCards, ...incomingCards]) {
    if (!seen.has(c.id)) {
      seen.add(c.id);
      mergedCards.push(c);
    }
  }

  const sourceAuthors = source.data?.authors ?? {};
  const incomingAuthors = incoming.data?.authors ?? {};
  Object.assign(mergedAuthors, sourceAuthors, incomingAuthors);

  if (mergedCards.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('resonanceSection.title')}</h2>
      <MiniCardGrid cards={mergedCards} authors={mergedAuthors} />
    </section>
  );
}
