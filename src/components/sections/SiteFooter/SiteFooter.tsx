'use client';

import { useTranslations } from 'next-intl';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { Link } from '@/i18n/navigation';
import styles from './SiteFooter.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';

const LINK_KEYS = ['about', 'contact', 'privacy', 'terms'] as const;
const HREFS: Record<(typeof LINK_KEYS)[number], string> = {
  about: '/#about',
  contact: 'mailto:hello@resonance.local',
  privacy: '/#stories',
  terms: '/#explore',
};

export function SiteFooter() {
  const t = useTranslations('footer');
  return (
    <footer className={styles.footer}>
      <SectionEdge
        topColor="var(--color-terracotta)"
        seed={233}
        height={90}
        amplitude={0.14}
        steps={14}
        stroke="oklch(20% 0.03 60 / 0.5)"
        strokeWidth={INK_LIGHT}
      />
      <div className={styles.container}>
        <div className={styles.brand}>
          <ResonanceIcon size={26} />
          <span className={styles.brandName}>Resonance</span>
        </div>
        <p className={styles.tagline}>&ldquo;{t('tagline')}&rdquo;</p>

        <div className={styles.links}>
          {LINK_KEYS.map((k) => (
            HREFS[k].startsWith('/') ? (
              <Link key={k} href={HREFS[k] as '/#about' | '/#stories' | '/#explore'} className={styles.link}>
                {t(k)}
              </Link>
            ) : (
              <a key={k} href={HREFS[k]} className={styles.link}>
                {t(k)}
              </a>
            )
          ))}
        </div>

        <div className={styles.divider} />

        <p className={styles.copyright}>{t('copyright')}</p>
      </div>
    </footer>
  );
}
