'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Link } from '@/i18n/navigation';
import styles from './CTASection.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';

/**
 * A title in its clauses, the comma kept with the first: each clause holds
 * together (CTASection.module.css), so a title too long for one line breaks
 * at the comma, never inside a clause (分享你的故事，｜讓世界聽見你的聲音).
 */
export function titleClauses(title: string): string[] {
  const at = title.search(/[，,]/);
  if (at < 0) return [title];
  return [title.slice(0, at + 1), title.slice(at + 1).trimStart()];
}

/**
 * The landing page's closing band: its calls to action — write your story
 * (the writer; a visitor signed out is asked to sign in first and comes back
 * to it), or read the stories already there (the feed, open to anyone). The
 * store badges are the footer's, right under it (with the stores' trademark
 * line), not a second pair here as well.
 */
export function CTASection() {
  const t = useTranslations('cta');
  const clauses = titleClauses(t('title'));
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
        <h2 className={styles.title}>
          {clauses.map((clause, i) => (
            <Fragment key={i}>
              {/* Two inline blocks may break between them; a Latin comma also wants its space. */}
              {i > 0 && clauses[0].endsWith(',') && ' '}
              <span className={styles.clause}>{clause}</span>
            </Fragment>
          ))}
        </h2>
        <p className={styles.description}>{t('description')}</p>
        <div className={styles.ctaRow}>
          <Link href="/write" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="ctaLight" block>{t('write')}</OrganicButton>
          </Link>
          <Link href="/home" style={{ textDecoration: 'none' }}>
            <OrganicButton variant="ctaGhost" block>{t('read')}</OrganicButton>
          </Link>
        </div>
      </div>
    </section>
  );
}
