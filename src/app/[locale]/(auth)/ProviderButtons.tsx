'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ButtonLoader } from '@/components/atoms/ButtonLoader/ButtonLoader';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { AppleMark } from '@/components/atoms/AppleMark/AppleMark';
import { APPLE_SIGN_IN, type SignInProvider } from '@/lib/auth/providers';
import { wobCircle } from '@/lib/design/wobCircle';
import styles from './auth.module.css';

// The white disc under Google's G on the terracotta button.
const DISC = wobCircle(15, 15, 14.6, 12, { segments: 8, mag: 0.7, cpJitter: 0.4 });

/**
 * A provider's mark in the buttons' 30px slot: Google's G keeps its colours on
 * a white wobbly disc (the terracotta face would swallow its red); Apple's
 * logo stands bare in the ink face's own white. While its sign-in is on its
 * way the slot holds the button's pen loop instead (B6), so nothing moves.
 */
function ProviderMark({ busy, disc, children }: { busy: boolean; disc: boolean; children: ReactNode }) {
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
 * The sign-in and sign-up pages' provider buttons, full width on the sheet
 * with no pen line of their own (a button is a filled shape; the sheet is the
 * frame). Sign in with Apple, once the web has it (APPLE_SIGN_IN), comes
 * first in ink — Apple asks for a black button at least as prominent as the
 * others, as in the apps — and Google follows in terracotta. The one pressed
 * shows it is working; the other waits.
 */
export function ProviderButtons({
  pending,
  onPick,
}: {
  pending: SignInProvider | null;
  onPick: (provider: SignInProvider) => void;
}) {
  const t = useTranslations('auth');
  const button = (provider: SignInProvider) => (
    <OrganicButton
      key={provider}
      variant={provider === 'apple' ? 'ink' : 'solid'}
      block
      className={styles.providerButton}
      loading={pending === provider}
      callerLoader
      disabled={pending !== null && pending !== provider}
      onClick={() => {
        if (!pending) onPick(provider);
      }}
    >
      <span className={styles.markLabel}>
        <ProviderMark busy={pending === provider} disc={provider === 'google'}>
          {provider === 'apple' ? <AppleMark size={20} /> : <GoogleMark size={18} />}
        </ProviderMark>
        {t(provider === 'apple' ? 'continueWithApple' : 'continueWithGoogle')}
      </span>
    </OrganicButton>
  );
  return (
    <div className={styles.providerButtons}>
      {APPLE_SIGN_IN && button('apple')}
      {button('google')}
    </div>
  );
}
