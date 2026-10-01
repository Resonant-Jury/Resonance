'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { AuthCard } from '@/components/molecules/AuthCard/AuthCard';
import { TermsConsent } from '@/components/molecules/TermsConsent/TermsConsent';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { AppleMark } from '@/components/atoms/AppleMark/AppleMark';
import { useAuth } from '@/components/providers/AuthProvider';
import { isIosNativeApp } from '@/lib/auth/firebase/native';
import { sanitizeNextPath } from '@/lib/auth/nextPath';

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
  // Apple ID is offered inside the iOS shell only (App Store requirement).
  // Detected in an effect so SSR and first client render agree.
  const [showApple, setShowApple] = useState(false);
  const [deletionScheduled, setDeletionScheduled] = useState(false);
  useEffect(() => {
    setShowApple(isIosNativeApp());
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

  async function signInWith(provider: 'google' | 'apple') {
    setPending(true);
    setError(null);
    try {
      if (provider === 'apple') await auth.signInWithApple();
      else await auth.signInWithGoogle();
      const next = sanitizeNextPath(queryParam('next')) ?? `/${locale}/home`;
      window.location.href = next;
    } catch {
      setError(t('signInError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('signInTitle')}>
      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          color: 'var(--color-text-muted)',
          lineHeight: 1.6,
          marginBottom: 24,
        }}
      >
        {t('googleIntro')}
      </p>
      {deletionScheduled && (
        <p
          role="status"
          style={{
            fontSize: 14,
            lineHeight: 1.6,
            fontWeight: 600,
            color: 'var(--color-terracotta)',
            marginBottom: 20,
          }}
        >
          {t('deletionScheduled')}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
        <OrganicButton variant="outline" onClick={() => signInWith('google')}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <GoogleMark size={18} />
            <BusyLabel busy={pending} idle={t('continueWithGoogle')} working={t('signingIn')} />
          </span>
        </OrganicButton>
        {showApple && (
          <OrganicButton variant="outline" onClick={() => signInWith('apple')}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <AppleMark size={18} />
              <BusyLabel busy={pending} idle={t('continueWithApple')} working={t('signingIn')} />
            </span>
          </OrganicButton>
        )}
      </div>
      {error && (
        <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
      <TermsConsent />
    </AuthCard>
  );
}
