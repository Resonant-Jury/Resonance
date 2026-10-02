'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { AppleMark } from '@/components/atoms/AppleMark/AppleMark';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './auth.module.css';

export type Provider = 'google' | 'apple';

/**
 * A button label that turns into "Signing in…" without resizing the button:
 * both labels sit in one grid cell, the one not showing hidden, so the cell
 * is as wide as the longer.
 */
function BusyLabel({ busy, idle, working }: { busy: boolean; idle: string; working: string }) {
  const cell = { gridArea: '1 / 1' } as const;
  return (
    <span style={{ display: 'inline-grid' }}>
      <span style={{ ...cell, visibility: busy ? 'hidden' : 'visible' }}>{idle}</span>
      <span style={{ ...cell, visibility: busy ? 'visible' : 'hidden' }}>{working}</span>
    </span>
  );
}

// The white disc under Google's G on the sheet's terracotta button.
const DISC = wobCircle(15, 15, 14.6, 12, { segments: 8, mag: 0.7, cpJitter: 0.4 });

/**
 * A provider's mark in the sheet buttons' 30px slot. Google's G keeps its
 * colours on a white wobbly disc (the terracotta face would swallow its red);
 * Apple's logo stands bare in the label's cream.
 */
function ProviderMark({ disc = false, children }: { disc?: boolean; children: ReactNode }) {
  return (
    <span className={styles.mark}>
      {disc && (
        <svg className={styles.disc} viewBox="0 0 30 30" aria-hidden="true">
          <path d={DISC} fill="#FFFFFF" />
        </svg>
      )}
      {children}
    </span>
  );
}

/**
 * The sign-in and sign-up pages' provider buttons. Both sets are in the
 * HTML and the width shows one: the desktop card keeps its outline buttons;
 * the phone's sheet is itself the frame, so its buttons draw none — Google
 * is its verb, and Apple (iOS shell only; first, as large) the black button
 * Apple asks for.
 */
export function ProviderButtons({
  showApple,
  pending,
  onPick,
}: {
  showApple: boolean;
  pending: boolean;
  onPick: (provider: Provider) => void;
}) {
  const t = useTranslations('auth');
  const sheetButton = pending ? `${styles.sheetButton} ${styles.busy}` : styles.sheetButton;
  const busyLabel = (idle: string) => <BusyLabel busy={pending} idle={idle} working={t('signingIn')} />;
  return (
    <>
      <div className={styles.cardButtons} data-layout="card">
        <OrganicButton variant="outline" onClick={() => onPick('google')}>
          <span className={styles.markLabel}>
            <GoogleMark size={18} />
            {busyLabel(t('continueWithGoogle'))}
          </span>
        </OrganicButton>
        {showApple && (
          <OrganicButton variant="outline" onClick={() => onPick('apple')}>
            <span className={styles.markLabel}>
              <AppleMark size={18} />
              {busyLabel(t('continueWithApple'))}
            </span>
          </OrganicButton>
        )}
      </div>
      <div className={styles.sheetButtons} data-layout="sheet">
        {showApple && (
          <OrganicButton variant="ink" block className={sheetButton} onClick={() => onPick('apple')}>
            <span className={styles.markLabel}>
              <ProviderMark>
                <AppleMark size={18} />
              </ProviderMark>
              {busyLabel(t('continueWithApple'))}
            </span>
          </OrganicButton>
        )}
        <OrganicButton variant="solid" block className={sheetButton} onClick={() => onPick('google')}>
          <span className={styles.markLabel}>
            <ProviderMark disc>
              <GoogleMark size={18} />
            </ProviderMark>
            {busyLabel(t('continueWithGoogle'))}
          </span>
        </OrganicButton>
      </div>
    </>
  );
}
