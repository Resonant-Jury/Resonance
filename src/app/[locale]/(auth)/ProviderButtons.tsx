'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './auth.module.css';

// The white disc under Google's G on the sheet's terracotta button.
const DISC = wobCircle(15, 15, 14.6, 12, { segments: 8, mag: 0.7, cpJitter: 0.4 });

/**
 * Google's mark in the sheet buttons' 30px slot: the G keeps its colours on a
 * white wobbly disc (the terracotta face would swallow its red). While the
 * sign-in is on its way the slot holds the button's pen loop instead (B6), so
 * nothing moves.
 */
function ProviderMark({ busy = false, children }: { busy?: boolean; children: ReactNode }) {
  if (busy) {
    return (
      <span className={styles.mark}>
        <ButtonLoader size={18} />
      </span>
    );
  }
  return (
    <span className={styles.mark}>
      <svg className={styles.disc} viewBox="0 0 30 30" aria-hidden="true">
        <path d={DISC} fill="#FFFFFF" />
      </svg>
      {children}
    </span>
  );
}

/**
 * The sign-in and sign-up pages' provider button. Both copies are in the
 * HTML and the width shows one: the desktop card's sits at its own width,
 * the phone sheet's spans it. Either way it wears the same face and no pen
 * line (a button is a filled shape; the card or the sheet is the frame).
 * Sign in with Apple lives in the iOS app only.
 */
export function ProviderButtons({ pending, onPick }: { pending: boolean; onPick: () => void }) {
  const t = useTranslations('auth');
  const button = (layout: 'card' | 'sheet') => (
    <OrganicButton
      variant="solid"
      block={layout === 'sheet'}
      className={layout === 'sheet' ? styles.sheetButton : undefined}
      loading={pending}
      callerLoader
      onClick={() => {
        if (!pending) onPick();
      }}
    >
      <span className={styles.markLabel}>
        <ProviderMark busy={pending}>
          <GoogleMark size={18} />
        </ProviderMark>
        {t('continueWithGoogle')}
      </span>
    </OrganicButton>
  );
  return (
    <>
      <div className={styles.cardButtons} data-layout="card">
        {button('card')}
      </div>
      <div className={styles.sheetButtons} data-layout="sheet">
        {button('sheet')}
      </div>
    </>
  );
}
