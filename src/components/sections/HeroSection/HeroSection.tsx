'use client';

import { useTranslations } from 'next-intl';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import styles from './HeroSection.module.css';

const AVATARS: { ini: string; color: string }[] = [
  { ini: 'AC', color: 'var(--color-terracotta-light)' },
  { ini: 'MS', color: 'var(--color-lavender)' },
  { ini: 'JP', color: 'var(--color-sage)' },
  { ini: 'AO', color: 'var(--color-yellow)' },
];

export function HeroSection() {
  const t = useTranslations('hero');
  return (
    <section className={styles.hero}>
      <div className={styles.blob1}>
        <OrganiBlob variant={1} fill="var(--color-terracotta-light)" size={380} />
      </div>
      <div className={styles.blob2}>
        <OrganiBlob variant={3} fill="var(--color-lavender)" size={300} />
      </div>
      <div className={styles.blob3}>
        <OrganiBlob variant={2} fill="var(--color-sage)" size={180} />
      </div>

      <div className={styles.content}>
        <div className={styles.tagWrap}>
          <TagPill color="var(--color-terracotta-light)">{t('tag')}</TagPill>
        </div>

        <h1 className={styles.headline}>
          {t('headlinePrefix')}<span className={styles.accentWrap}><span className={styles.accent}>{t('headlineAccent')}</span><svg viewBox="0 0 200 12" className={styles.squiggle}><path d="M2,8 C30,2 60,12 90,6 C120,0 150,10 198,6" stroke="var(--color-terracotta)" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.6" /></svg></span>{t('headlineSuffix')}
        </h1>

        <p className={styles.description}>{t('description')}</p>

        <div className={styles.ctaRow}>
          <OrganicButton variant="primary">{t('explore')}</OrganicButton>
          <OrganicButton variant="ghost">{t('share')}</OrganicButton>
        </div>

        <div className={styles.proof}>
          <div className={styles.avatarStack}>
            {AVATARS.map((a, i) => (
              <div key={a.ini} style={{ marginLeft: i > 0 ? -10 : 0 }}>
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
