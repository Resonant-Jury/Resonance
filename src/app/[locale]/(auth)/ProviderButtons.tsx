'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { AppleMark } from '@/components/atoms/AppleMark/AppleMark';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './auth.module.css';

export type Provider = 'google' | 'apple';

// The white disc under Google's G on the sheet's terracotta button.
const DISC = wobCircle(15, 15, 14.6, 12, { segments: 8, mag: 0.7, cpJitter: 0.4 });

/**
 * A provider's mark in the sheet buttons' 30px slot. Google's G keeps its
 * colours on a white wobbly disc (the terracotta face would swallow its red);
 * Apple's logo stands bare in the label's cream. While its sign-in is on its
 * way the slot holds the button's pen loop instead (B6), so nothing moves.
 */
function ProviderMark({ disc = false, busy = false, children }: { disc?: boolean; busy?: boolean; children: ReactNode }) {
  if (busy) {
    return (
      <span className={styles.mark}>
        <ButtonLoader size={18} />
      </span>
    );
  }
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
 * HTML and the width shows one: the desktop card's sit at their own width,
 * the phone sheet's span it. Either way they wear the same faces and no pen
 * line (a button is a filled shape; the card or the sheet is the frame) —
 * Google is the verb, and Apple (iOS shell only; first, as large) the black
 * button Apple asks for.
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
  // Which one was pressed: it shows the loader, the other rests until the answer.
  const [picked, setPicked] = useState<Provider | null>(null);
  const pick = (provider: Provider) => {
    if (pending) return;
    setPicked(provider);
    onPick(provider);
  };
  const busy = (provider: Provider) => pending && picked === provider;
  const resting = (provider: Provider) => pending && picked !== provider;
  const button = (provider: Provider, layout: 'card' | 'sheet') => {
    const apple = provider === 'apple';
    return (
      <OrganicButton
        variant={apple ? 'ink' : 'solid'}
        block={layout === 'sheet'}
        className={layout === 'sheet' ? styles.sheetButton : undefined}
        loading={busy(provider)}
        callerLoader
        disabled={resting(provider)}
        onClick={() => pick(provider)}
      >
        <span className={styles.markLabel}>
          <ProviderMark disc={!apple} busy={busy(provider)}>
            {apple ? <AppleMark size={18} /> : <GoogleMark size={18} />}
          </ProviderMark>
          {t(apple ? 'continueWithApple' : 'continueWithGoogle')}
        </span>
      </OrganicButton>
    );
  };
  return (
    <>
      <div className={styles.cardButtons} data-layout="card">
        {showApple && button('apple', 'card')}
        {button('google', 'card')}
      </div>
      <div className={styles.sheetButtons} data-layout="sheet">
        {showApple && button('apple', 'sheet')}
        {button('google', 'sheet')}
      </div>
    </>
  );
}
