'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { sanitizeNextPath, nextQuery } from '@/lib/auth/nextPath';
import { PROFILE_REGIONS, regionDisplayName } from '@/lib/regionName';
import { signInFailure, type SignInProvider } from '@/lib/auth/providers';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';
import { AuthCard } from '@/components/molecules/AuthCard/AuthCard';
import { Divider } from '@/components/atoms/Divider/Divider';
import { Field, Input, Select } from '@/components/atoms/Field/Field';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  HANDLE_FORBIDDEN,
  checkHandleAvailable,
  createCurrentUserProfile,
  isHandleTaken,
} from '@/lib/db/firestore/client/profile';
import { ProviderButtons } from '../ProviderButtons';
import styles from '../auth.module.css';

type Step = 'provider' | 'profile';

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
  const [step, setStep] = useState<Step>('provider');
  const handleId = useId();

  useEffect(() => {
    if (!auth.loading && auth.user && step === 'provider') {
      setStep('profile');
    }
  }, [auth.loading, auth.user, step]);
  const [handle, setHandle] = useState('');
  const [region, setRegion] = useState('TW');
  const [primaryLocale, setPrimaryLocale] = useState<'en' | 'zh-TW'>('zh-TW');
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [pending, setPending] = useState<SignInProvider | null>(null);
  const [saving, setSaving] = useState(false);
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

  async function start(provider: SignInProvider) {
    if (pending) return;
    setPending(provider);
    setError(null);
    try {
      if (provider === 'apple') await auth.signInWithApple(locale);
      else await auth.signInWithGoogle();
      setStep('profile');
    } catch (err) {
      const failure = signInFailure(err);
      if (failure !== 'cancelled') setError(t(failure === 'otherProvider' ? 'otherProviderError' : 'signUpError'));
    } finally {
      setPending(null);
    }
  }

  async function finish() {
    if (saving || handleState !== 'available') return;
    setSaving(true);
    setError(null);
    try {
      await createCurrentUserProfile({ handle: handle.trim(), region, primaryLocale });
      const next = sanitizeNextPath(nextParam()) ?? `/${locale}/write`;
      window.location.href = next;
    } catch (err) {
      // Someone took the name between the check and the save.
      if (isHandleTaken(err)) setHandleState('taken');
      else setError(t('signUpError'));
      setSaving(false);
    }
  }

  const handleHint =
    handleState === 'checking' ? (
      t('handleChecking')
    ) : handleState === 'available' ? (
      <span className={styles.handleState}>
        <HandDrawnCheckmark size={12} /> {t('handleAvailable')}
      </span>
    ) : handleState === 'taken' ? (
      t('handleTaken')
    ) : undefined;

  return (
    <AuthCard
      title={t('signUpTitle')}
      subtitle={t(step === 'provider' ? 'signUpSubtitle' : 'profileSubtitle')}
      focus={step === 'profile'}
    >
      {step === 'provider' && <ProviderButtons pending={pending} onPick={start} />}

      {step === 'profile' && (
        <>
          <div className={styles.profileFields}>
            <Field
              label={t('handleLabel')}
              htmlFor={handleId}
              hint={handleHint}
              hintTone={handleState === 'available' ? 'ok' : handleState === 'taken' ? 'error' : 'default'}
            >
              <Input
                id={handleId}
                seed={31}
                type="text"
                autoComplete="nickname"
                value={handle}
                onChange={(e) => setHandle(e.target.value.replace(HANDLE_FORBIDDEN, '').slice(0, 20))}
              />
            </Field>

            <Field label={t('regionLabel')}>
              <Select seed={43} value={region} onChange={setRegion} ariaLabel={t('regionLabel')}>
                {PROFILE_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    <SquareFlag code={r.toLowerCase()} size={18} />
                    {regionDisplayName(r, locale)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={t('primaryLocaleLabel')}>
              <Select
                seed={63}
                value={primaryLocale}
                onChange={(v) => setPrimaryLocale(v as 'en' | 'zh-TW')}
                ariaLabel={t('primaryLocaleLabel')}
              >
                <option value="zh-TW">繁體中文</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>

          <div className={`${styles.providerButtons} ${styles.finish}`}>
            <OrganicButton
              variant="solid"
              block
              className={styles.providerButton}
              onClick={finish}
              loading={saving}
              disabled={handleState !== 'available'}
            >
              {t('finish')}
            </OrganicButton>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {/* Signed in already on the profile step: no way to the sign-in page there. */}
      {step === 'provider' && (
        <>
          <div className={styles.rule}>
            <Divider seed={29} spacing={0} />
          </div>
          <p className={styles.switchLine}>
            {t('switchToSignIn')} <OrganicLink href={`/${locale}${signInHref}`}>{t('signIn')}</OrganicLink>
          </p>
        </>
      )}
    </AuthCard>
  );
}
