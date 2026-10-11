'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { sanitizeNextPath, nextQuery } from '@/lib/auth/nextPath';
import { PROFILE_REGIONS, regionDisplayName } from '@/lib/regionName';
import { signInFailure, type SignInProvider } from '@/lib/auth/providers';
import { PROFILE_STEP, afterSignupPath, needsProfile, replacePage } from '@/lib/auth/afterSignIn';
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
  getCurrentUserHandle,
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

  // Sent here for the profile step (a first sign-in, the shell finding no pen
  // name): show it at once rather than the providers first. The account is
  // still checked below.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('step') === PROFILE_STEP) setStep('profile');
  }, []);

  // A signed-in reader: the profile step if the account has no pen name yet;
  // one that has (signed in here with an existing account, or stepped back
  // to this page) goes on to `next`, else the feed — never the form again.
  const checkedFor = useRef<string | null>(null);
  const uid = auth.user?.id ?? null;
  useEffect(() => {
    if (auth.loading) return;
    if (!uid) {
      checkedFor.current = null;
      setStep('provider');
      return;
    }
    if (checkedFor.current === uid) return;
    checkedFor.current = uid;
    let live = true;
    getCurrentUserHandle()
      .then((current) => {
        if (!live) return;
        if (needsProfile(current)) setStep('profile');
        else replacePage(sanitizeNextPath(nextParam()) ?? `/${locale}/home`);
      })
      // Unknown: the form, whose save answers for an account that has a profile already.
      .catch(() => live && setStep('profile'));
    return () => {
      live = false;
      checkedFor.current = null;
    };
  }, [auth.loading, uid, locale]);
  const [handle, setHandle] = useState('');
  const [region, setRegion] = useState('TW');
  const [primaryLocale, setPrimaryLocale] = useState<'en' | 'zh-TW'>('zh-TW');
  const [handleState, setHandleState] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [pending, setPending] = useState<SignInProvider | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stepped back to from the browser's page cache, the page comes back as it
  // was left — mid-save, its button working for ever. It answers again.
  useEffect(() => {
    const restored = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setPending(null);
      setSaving(false);
    };
    window.addEventListener('pageshow', restored);
    return () => window.removeEventListener('pageshow', restored);
  }, []);

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
      // Signed in: the account check above takes it from here (the profile
      // step, or on for an account that has a pen name).
      if (provider === 'apple') await auth.signInWithApple(locale);
      else await auth.signInWithGoogle();
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
      // On to the first card (or `next`); the writer's way out goes to the
      // feed, not back here — the card can wait (useLeaveWriter).
      replacePage(afterSignupPath(sanitizeNextPath(nextParam()) ?? `/${locale}/write`));
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
