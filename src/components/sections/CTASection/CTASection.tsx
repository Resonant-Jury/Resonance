'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import styles from './CTASection.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';

/**
 * The landing page's closing band: its calls to action. The store badges are
 * the footer's, right under it (with the stores' trademark line), not a
 * second pair here as well.
 */
export function CTASection() {
  const t = useTranslations('cta');
  return (
    <section id="explore" className={styles.section}>
      <SectionEdge
        topColor="var(--color-cream-dark)"
        seed={137}
        height={100}
        amplitude={0.13}
        steps={14}
        stroke="oklch(40% 0.12 45 / 0.35)"
        strokeWidth={INK_LIGHT}
      />

      <div className={styles.blobTop}>
        <OrganiBlob variant={2} fill="oklch(98% 0.01 75)" size={280} />
      </div>
      <div className={styles.blobBottom}>
        <OrganiBlob variant={0} fill="oklch(98% 0.01 75)" size={220} />
      </div>

      <div className={styles.content}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.description}>{t('description')}</p>
        <div className={styles.ctaRow}>
          <Link href="/signup" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="ctaLight">{t('start')}</OrganicButton>
          </Link>
          <Link href="/write" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="ctaGhost">{t('create')}</OrganicButton>
          </Link>
        </div>
      </div>
    </section>
  );
}
