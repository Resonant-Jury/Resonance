'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { sanitizeNextPath, nextQuery } from '@/lib/auth/nextPath';
import { PROFILE_REGIONS, regionDisplayName, regionFlag } from '@/lib/regionName';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';
import { AuthCard, Field } from '@/components/molecules/AuthCard/AuthCard';
import { OrganicInput, OrganicSelect } from '@/components/atoms/OrganicInput/OrganicInput';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { useAuth } from '@/components/providers/AuthProvider';
import { isIosNativeApp } from '@/lib/auth/firebase/native';
import {
  HANDLE_FORBIDDEN,
  checkHandleAvailable,
  createCurrentUserProfile,
  isHandleTaken,
} from '@/lib/db/firestore/client/profile';
import { ProviderButtons, type Provider } from '../ProviderButtons';
import styles from '../auth.module.css';

type Step = 'google' | 'profile';

/** The page's own `next` parameter — read in the browser, when it is needed. */
function nextParam(): string | null {
  return new URLSearchParams(window.location.search).get('next');
}

/**
 * Renders whole on the server, like the sign-in page: the query string is
 * read in the browser only (useSearchParams while rendering left the static
 * HTML without the form).
 */
export default function SignUpPage() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const auth = useAuth();
  // Carried to the sign-in link once mounted (the server can't know it).
  const [signInHref, setSignInHref] = useState('/signin');
  useEffect(() => setSignInHref(`/signin${nextQuery(nextParam())}`), []);
  const [step, setStep] = useState<Step>('google');

  useEffect(() => {
    if (!auth.loading && auth.user && step === 'google') {
      setStep('profile');
    }
  }, [auth.loading, auth.user, step]);
  const [handle, setHandle] = useState('');
  const [region, setRegion] = useState('TW');
  const [primaryLocale, setPrimaryLocale] = useState<'en' | 'zh-TW'>('zh-TW');
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== 'profile' || handle.trim().length < 2) {
      setHandleState('idle');
      return;
    }
    setHandleState('checking');
    let live = true;
    const h = setTimeout(() => {
      checkHandleAvailable(handle)
        .then((ok) => live && setHandleState(ok ? 'available' : 'taken'))
        // Unknown (offline, a hiccup): let the next keystroke ask again.
        .catch(() => live && setHandleState('idle'));
    }, 350);
    return () => {
      live = false;
      clearTimeout(h);
    };
  }, [handle, step]);

  // Apple ID is offered inside the iOS shell only (App Store requirement).
  // Detected in an effect so SSR and first client render agree.
  const [showApple, setShowApple] = useState(false);
  useEffect(() => {
    setShowApple(isIosNativeApp());
  }, []);

  async function startWith(provider: Provider) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (provider === 'apple') await auth.signInWithApple();
      else await auth.signInWithGoogle();
      setStep('profile');
    } catch {
      setError(t('signUpError'));
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    setPending(true);
    setError(null);
    try {
      await createCurrentUserProfile({ handle: handle.trim(), region, primaryLocale });
      const next = sanitizeNextPath(nextParam()) ?? `/${locale}/write`;
      window.location.href = next;
    } catch (err) {
      // Someone took the name between the check and the save.
      if (isHandleTaken(err)) setHandleState('taken');
      else setError(t('signUpError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard
      title={t('signUpTitle')}
      intro={step === 'google' ? t(showApple ? 'appleGoogleIntro' : 'googleIntro') : undefined}
    >
      {step === 'google' && <ProviderButtons showApple={showApple} pending={pending} onPick={startWith} />}

      {step === 'profile' && (
        <>
          <Field label={t('handleLabel')}>
            <OrganicInput
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.replace(HANDLE_FORBIDDEN, '').slice(0, 20))}
            />
            <div style={{ marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              {handleState === 'checking' && (
                <span style={{ color: 'var(--color-text-muted)' }}>{t('handleChecking')}</span>
              )}
              {handleState === 'available' && (
                <span style={{ color: 'var(--color-sage, oklch(55% 0.13 140))', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <HandDrawnCheckmark size={12} /> {t('handleAvailable')}
                </span>
              )}
              {handleState === 'taken' && (
                <span style={{ color: 'var(--color-terracotta)' }}>{t('handleTaken')}</span>
              )}
            </div>
          </Field>

          <Field label={t('regionLabel')}>
            <OrganicSelect value={region} onChange={(e) => setRegion(e.target.value)}>
              {PROFILE_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {regionFlag(r)} {regionDisplayName(r, locale)}
                </option>
              ))}
            </OrganicSelect>
          </Field>

          <Field label={t('primaryLocaleLabel')}>
            <OrganicSelect
              value={primaryLocale}
              onChange={(e) => setPrimaryLocale(e.target.value as 'en' | 'zh-TW')}
            >
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
            </OrganicSelect>
          </Field>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div
              style={{
                opacity: handleState === 'available' ? 1 : 0.5,
                pointerEvents: handleState === 'available' ? 'auto' : 'none',
              }}
            >
              <OrganicButton variant="primary" onClick={finish} loading={pending}>
                {t('finish')}
              </OrganicButton>
            </div>
          </div>
        </>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <p className={styles.switchLine}>
        {t('switchToSignIn')} <OrganicLink href={`/${locale}${signInHref}`}>{t('signIn')}</OrganicLink>
      </p>
    </AuthCard>
  );
}
