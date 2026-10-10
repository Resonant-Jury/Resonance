'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AuthCard } from '@/components/molecules/AuthCard/AuthCard';
import { TermsConsent } from '@/components/molecules/TermsConsent/TermsConsent';
import { useAuth } from '@/components/providers/AuthProvider';
import { sanitizeNextPath } from '@/lib/auth/nextPath';
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
  const [pending, setPending] = useState(false);
  const [deletionScheduled, setDeletionScheduled] = useState(false);
  useEffect(() => {
    setDeletionScheduled(queryParam('notice') === 'deletion-scheduled');
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

  async function signIn() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await auth.signInWithGoogle();
      const next = sanitizeNextPath(queryParam('next')) ?? `/${locale}/home`;
      window.location.href = next;
    } catch {
      setError(t('signInError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('signInTitle')} intro={t('googleIntro')}>
      {deletionScheduled && (
        <p role="status" className={styles.notice}>
          {t('deletionScheduled')}
        </p>
      )}
      <ProviderButtons pending={pending} onPick={signIn} />
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.terms}>
        <TermsConsent />
      </div>
    </AuthCard>
  );
}
