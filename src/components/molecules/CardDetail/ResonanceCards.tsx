'use client';

import { useTranslations } from 'next-intl';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { useReferencedCard, useResonanceCards } from '@/lib/data/hooks';
import type { Card } from '@/lib/db/types';
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

  if (incomingCards.length === 0 && sourceCards.length === 0) return null;

  return (
    <>
      {sourceCards.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>{t('resonanceSection.sourceTitle')}</h2>
          <MiniCardGrid cards={sourceCards} authors={source.data!.authors} />
        </section>
      )}

      {incomingCards.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.heading}>{t('resonanceSection.title')}</h2>
          <MiniCardGrid cards={incomingCards} authors={incoming.data!.authors} />
        </section>
      )}
    </>
  );
}
