'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { StoryCard } from '@/components/molecules/StoryCard/StoryCard';
import { Link } from '@/i18n/navigation';
import type { Card, User } from '@/lib/db/types';
import { cardToStory } from '@/lib/mock/adapters';
import styles from './CardFeedSection.module.css';

export interface CardFeedSectionProps {
  cards: Card[];
  authors: Record<string, User>;
}

export function CardFeedSection({ cards, authors }: CardFeedSectionProps) {
  const t = useTranslations('feed');
  return (
    <section id="stories" className={styles.section}>
      <SectionEdge
        topColor="var(--color-cream)"
        seed={41}
        height={90}
        amplitude={0.14}
        steps={14}
        stroke="oklch(55% 0.05 60 / 0.28)"
        strokeWidth={1.2}
      />

      <div className={styles.blob}>
        <OrganiBlob variant={4} fill="var(--color-yellow)" size={320} />
      </div>

      <div className={styles.container}>
        <div className={styles.heading}>
          <TagPill color="var(--color-sage)">{t('tag')}</TagPill>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>

        <div
          data-card-grid
          className={styles.grid}
        >
          {cards.map((card, i) => {
            const author = authors[card.authorId];
            const story = author
              ? cardToStory(card, author)
              : {
                  title: card.thoughtCore,
                  excerpt: '',
                  author: '—',
                  authorInitials: '?',
                  readTime: '—',
                  tags: card.tags,
                };
            return (
              <Link
                key={card.id}
                href={`/card/${card.id}`}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                  breakInside: 'avoid',
                }}
              >
                <StoryCard story={story} index={i} isLast={i === cards.length - 1} />
              </Link>
            );
          })}
        </div>

        <div className={styles.loadMore}>
          <Link href="/home" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="outline">{t('viewAll')}</OrganicButton>
          </Link>
        </div>
      </div>
    </section>
  );
}
