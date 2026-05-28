'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { StoryCard, type Story } from '@/components/molecules/StoryCard/StoryCard';
import styles from './CardFeedSection.module.css';

export interface CardFeedSectionProps {
  stories: Story[];
}

export function CardFeedSection({ stories }: CardFeedSectionProps) {
  const t = useTranslations('feed');
  return (
    <section className={styles.section}>
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
          {stories.map((story, i) => (
            <StoryCard key={i} story={story} index={i} isLast={i === stories.length - 1} />
          ))}
        </div>

        <div className={styles.loadMore}>
          <OrganicButton variant="outline">{t('viewAll')}</OrganicButton>
        </div>
      </div>
    </section>
  );
}
