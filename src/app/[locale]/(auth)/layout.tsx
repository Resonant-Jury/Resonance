import type { Viewport } from 'next';
import { ResonanceIcon } from '@/components/atoms/ResonanceIcon/ResonanceIcon';
import { OrganiBlob } from '@/components/atoms/OrganiBlob/OrganiBlob';
import { DriftingBlobs, type DriftPaint } from '@/components/atoms/DriftingBlobs/DriftingBlobs';
import { StorytellerProof } from '@/components/molecules/StorytellerProof/StorytellerProof';
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

/** The landing hero's blob colours, a touch fainter behind the lockup. */
const BLOB_PAINTS: DriftPaint[] = [
  { color: '--color-terracotta-light', alpha: 0.28 },
  { color: '--color-lavender', alpha: 0.22 },
  { color: '--color-sage', alpha: 0.18 },
  { color: '--color-yellow', alpha: 0.26 },
];
const STAND_IN_GRAIN = 0.2;

/**
 * The brand's cover beside the sign-in / sign-up sheet on a wide screen, over
 * it on a phone or an upright tablet: the mark over the wordmark, the hero's
 * line and its storytellers under it, the hero's blobs drifting behind
 * (auth.module.css).
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
        {/* Still as the server draws the page; on the client they drift as the landing hero's do. */}
        <DriftingBlobs palette={BLOB_PAINTS}>
          <div className={styles.drift1} data-drift="1,0.15" data-drift-color="--color-lavender">
            <OrganiBlob variant={3} fill="var(--color-lavender)" size={260} grain={STAND_IN_GRAIN} />
          </div>
          <div className={styles.drift2} data-drift="-1,-0.1" data-drift-color="--color-sage">
            <OrganiBlob variant={2} fill="var(--color-sage)" size={200} grain={STAND_IN_GRAIN} />
          </div>
          <div className={styles.drift3} data-drift="-0.6,0.4" data-drift-color="--color-yellow">
            <OrganiBlob variant={0} fill="var(--color-yellow)" size={150} grain={STAND_IN_GRAIN} />
          </div>
        </DriftingBlobs>
        <div className={styles.brand}>
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
          <StorytellerProof className={styles.proof} />
        </div>
      </div>
      {children}
    </main>
  );
}
