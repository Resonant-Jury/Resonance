'use client';

import { useTranslations } from 'next-intl';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import type { CardsWithAuthors } from '@/lib/data/hooks';
import styles from './ResonanceCards.module.css';

/**
 * The resonance relationships around a card, rendered as clean centered sections
 * (matching the home page's section rhythm) rather than a framed, tinted block.
 *
 * Resonance is bidirectional — the original this card resonates from (when it
 * is itself a response), then every public card resonating with it. The page
 * hands both over as one list (useCardPageLists), each card once, and they
 * render as simplified {@link MiniCardGrid} cards. Renders nothing when there
 * is nothing to show.
 */
export function ResonanceCards({ cards, authors }: CardsWithAuthors) {
  const t = useTranslations('card');
  if (cards.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{t('resonanceSection.title')}</h2>
      <MiniCardGrid cards={cards} authors={authors} />
    </section>
  );
}
