import type { Viewport } from 'next';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { Emphasis } from '@/components/atoms/Emphasis/Emphasis';
import { Link } from '@/i18n/navigation';
import { INK } from '@/lib/design/strokes';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import styles from './auth.module.css';

// The phone's sheet runs on under the home indicator, padding itself with
// env(safe-area-inset-bottom). Only these pages: the rest of the site pads
// no insets, and `cover` would put it under a landscape notch. Merged key by
// key with the root's (its themeColor stays).
export const viewport: Viewport = {
  viewportFit: 'cover',
};

/**
 * The brand over the sign-in / sign-up card. On a wide screen both sit
 * centred on the paper; on a phone the brand is a cover filling what the
 * card's sheet leaves, with the hero's line under the wordmark (auth.module.css).
 */
export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('hero');
  return (
    <main className={styles.page}>
      <div className={styles.cover}>
        <div className={styles.brand}>
          <div className={styles.blob} aria-hidden>
            <OrganiBlob fill="var(--color-terracotta-light)" size={176} />
          </div>
          <Link href="/" className={styles.lockup}>
            <ResonanceIcon size={44} />
            <span className={styles.wordmark}>Resonance</span>
          </Link>
          <p className={styles.tagline}>
            {t('headlinePrefix')}
            <Emphasis className={styles.accent} strokeWidth={INK}>
              {t('headlineAccent')}
            </Emphasis>
            {t('headlineSuffix')}
          </p>
        </div>
      </div>
      {children}
    </main>
  );
}
