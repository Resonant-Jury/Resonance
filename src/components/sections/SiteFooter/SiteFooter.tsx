'use client';

import { useTranslations } from 'next-intl';
import { SectionEdge } from '@/components/atoms/SectionEdge/SectionEdge';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { GetTheApp } from '@/components/molecules/GetTheApp/GetTheApp';
import { Link } from '@/i18n/navigation';
import styles from './SiteFooter.module.css';
import { INK_LIGHT } from '@/lib/design/strokes';

const LINK_KEYS = ['about', 'contact', 'privacy', 'terms'] as const;
const HREFS: Record<(typeof LINK_KEYS)[number], string> = {
  about: '/#about',
  contact: '/support',
  privacy: '/privacy',
  terms: '/terms',
};

export interface SiteFooterProps {
  /**
   * The colour above the footer's wave: the landing page's terracotta CTA
   * band by default; a page that ends on plain paper passes the cream so
   * the page runs straight into the wave.
   */
  edgeColor?: string;
}

export function SiteFooter({ edgeColor = 'var(--color-terracotta)' }: SiteFooterProps = {}) {
  const t = useTranslations('footer');
  return (
    <footer className={styles.footer}>
      <SectionEdge
        topColor={edgeColor}
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

        <GetTheApp qr={false} size="sm" tone="ink" />

        <div className={styles.links}>
          {LINK_KEYS.map((k) => (
            <Link key={k} href={HREFS[k]} className={styles.link}>
              {t(k)}
            </Link>
          ))}
        </div>

        <div className={styles.divider} />

        <p className={styles.copyright}>{t('copyright')}</p>
      </div>
    </footer>
  );
}
