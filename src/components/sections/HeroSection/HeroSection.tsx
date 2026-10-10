'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { DriftingBlobs, type DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { DOWNLOAD_ANCHOR } from '@/lib/appStores';
import styles from './HeroSection.module.css';
import { INK_STRONG } from '@/lib/design/strokes';

const AVATARS: { ini: string; color: string }[] = [
  { ini: '念', color: 'var(--color-terracotta-light)' },
  { ini: '蕭', color: 'var(--color-lavender)' },
  { ini: '方', color: 'var(--color-sage)' },
  { ini: 'TE', color: 'var(--color-yellow)' },
];

/** The colours a newcomer among the hero's blobs is drawn in, and how strongly each shows. */
const BLOB_PAINTS: DriftPaint[] = [
  { color: '--color-terracotta-light', alpha: 0.32 },
  { color: '--color-lavender', alpha: 0.26 },
  { color: '--color-sage', alpha: 0.22 },
  { color: '--color-yellow', alpha: 0.3 },
];

export function HeroSection() {
  const t = useTranslations('hero');
  return (
    <section id="about" className={styles.hero}>
      {/* Still here as the server draws the page; on the client they come alive and drift away
          (data-drift is each one's heading), new ones drift in, and two that meet melt into one. */}
      <DriftingBlobs palette={BLOB_PAINTS}>
        <div className={styles.blob1} data-drift="1,0.12" data-drift-color="--color-terracotta-light">
          <OrganiBlob variant={1} fill="var(--color-terracotta-light)" size={380} />
        </div>
        <div className={styles.blob2} data-drift="-1,-0.08" data-drift-color="--color-lavender">
          <OrganiBlob variant={3} fill="var(--color-lavender)" size={300} />
        </div>
        <div className={styles.blob3} data-drift="1,-0.2" data-drift-color="--color-sage">
          <OrganiBlob variant={2} fill="var(--color-sage)" size={180} />
        </div>
      </DriftingBlobs>

      <div className={styles.content}>
        <div className={styles.tagWrap}>
          <TagPill color="var(--color-terracotta-light)">{t('tag')}</TagPill>
        </div>

        <h1 className={styles.headline}>
          {t('headlinePrefix')}<span className={styles.accentWrap}><span className={styles.accent}>{t('headlineAccent')}</span><svg viewBox="0 0 200 12" className={styles.squiggle}><path d="M2,8 C30,2 60,12 90,6 C120,0 150,10 198,6" stroke="var(--color-terracotta)" strokeWidth={INK_STRONG} fill="none" strokeLinecap="round" opacity="0.6" /></svg></span>{t('headlineSuffix')}
        </h1>

        <p className={styles.description}>{t('description')}</p>

        <GetTheApp id={DOWNLOAD_ANCHOR} className={styles.download} />

        <div className={styles.proof}>
          <div className={styles.avatarStack}>
            {/* Overlapping by 6px: each one's initials stay whole beside the next (10px cut into them). */}
            {AVATARS.map((a, i) => (
              <div key={a.ini} style={{ marginLeft: i > 0 ? -6 : 0 }}>
                <HandDrawnAvatar initials={a.ini} size={30} seed={i * 55 + 3} color={a.color} />
              </div>
            ))}
          </div>
          <span className={styles.proofText}>{t('proof')}</span>
        </div>
      </div>
    </section>
  );
}
