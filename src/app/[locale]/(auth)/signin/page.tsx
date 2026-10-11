'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AuthCard } from '@/components/molecules/AuthCard/AuthCard';
import { Divider } from '@/components/atoms/Divider/Divider';
import { TermsConsent } from '@/components/molecules/TermsConsent/TermsConsent';
import { useAuth } from '@/components/providers/AuthProvider';
import { sanitizeNextPath } from '@/lib/auth/nextPath';
import { signInFailure, type SignInProvider } from '@/lib/auth/providers';
import { destinationAfterSignIn, replacePage } from '@/lib/auth/afterSignIn';
import { ProviderButtons } from '../ProviderButtons';
import styles from '../auth.module.css';

const RESUME_KEY = 'resonance:signin-resume';

/**
 * Claim the one automatic hop back to `next` allowed per half minute, so a
 * browser that won't keep the cookie can't bounce between here and the page
 * that sent it. No storage → no hop (the sign-in button still works).
 */
function claimResume(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RESUME_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    window.sessionStorage.setItem(RESUME_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

/** A query parameter of the page's own address — read in the browser, at the moment it is needed. */
function queryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

/**
 * The sign-in page renders whole on the server: nothing it draws depends on
 * the query string, which is read in the browser only when needed (`next` on
 * a sign-in, the notice once mounted). Reading it while rendering
 * (useSearchParams) left the static HTML without the form — and a reader
 * waiting on scripts, or running none, without the sign-in button.
 */
export default function SignInPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<SignInProvider | null>(null);
  const [deletionScheduled, setDeletionScheduled] = useState(false);
  useEffect(() => {
    setDeletionScheduled(queryParam('notice') === 'deletion-scheduled');
  }, []);
  // Stepped back to from the browser's page cache, the page comes back as it
  // was left — mid-sign-in. The way in answers again.
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (e.persisted) setPending(null);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

  // Sent here by the middleware (a protected page with no session cookie)
  // while still signed in — the cookie is refreshed in the background, and a
  // page opened before it landed, or after it lapsed, arrives here. Mint it
  // and carry on to where the reader was going.
  const { loading: authLoading, refreshSession } = auth;
  const signedInId = auth.user?.id;
  const resumed = useRef(false);
  useEffect(() => {
    const resumeTo = sanitizeNextPath(queryParam('next'));
    if (resumed.current || authLoading || !signedInId || !resumeTo || !claimResume()) return;
    resumed.current = true;
    refreshSession().then(
      () => window.location.replace(resumeTo),
      () => {
        // Couldn't mint it — the sign-in button below still can.
      },
    );
  }, [authLoading, signedInId, refreshSession]);

  async function signIn(provider: SignInProvider) {
    if (pending) return;
    setPending(provider);
    setError(null);
    try {
      if (provider === 'apple') await auth.signInWithApple(locale);
      else await auth.signInWithGoogle();
      // A first sign-in goes straight on to the sign-up's profile step (no hop
      // through the feed); this page leaves the tab's history, so no way back
      // lands on it again. The button keeps working until the next page takes over.
      replacePage(await destinationAfterSignIn(locale, queryParam('next')));
    } catch (err) {
      setPending(null);
      const failure = signInFailure(err);
      if (failure !== 'cancelled') setError(t(failure === 'otherProvider' ? 'otherProviderError' : 'signInError'));
    }
  }

  return (
    <AuthCard title={t('signInTitle')} subtitle={t('signInSubtitle')}>
      {deletionScheduled && (
        <p role="status" className={styles.notice}>
          {t('deletionScheduled')}
        </p>
      )}
      <ProviderButtons pending={pending} onPick={signIn} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.rule}>
        <Divider seed={29} spacing={0} />
      </div>
      <div className={styles.terms}>
        <TermsConsent />
      </div>
    </AuthCard>
  );
}
