'use client';

import { Suspense, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { sanitizeNextPath, nextQuery } from '@/lib/auth/nextPath';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { AuthCard, Field } from '@/components/molecules/AuthCard/AuthCard';
import { OrganicInput, OrganicSelect } from '@/components/atoms/OrganicInput/OrganicInput';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { AppleMark } from '@/components/atoms/AppleMark/AppleMark';
import { useAuth } from '@/components/providers/AuthProvider';
import { isIosNativeApp } from '@/lib/auth/firebase/native';
import { checkHandleAvailable, createCurrentUserProfile } from '@/lib/db/firestore/client/profile';

type Step = 'google' | 'profile';

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpPageInner />
    </Suspense>
  );
}

function SignUpPageInner() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const auth = useAuth();
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
    if (step !== 'profile' || handle.length < 2) {
      setHandleState('idle');
      return;
    }
    setHandleState('checking');
    const h = setTimeout(async () => {
      const ok = await checkHandleAvailable(handle);
      setHandleState(ok ? 'available' : 'taken');
    }, 350);
    return () => clearTimeout(h);
  }, [handle, step]);

  // Apple ID is offered inside the iOS shell only (App Store requirement).
  // Detected in an effect so SSR and first client render agree.
  const [showApple, setShowApple] = useState(false);
  useEffect(() => {
    setShowApple(isIosNativeApp());
  }, []);

  async function startWith(provider: 'google' | 'apple') {
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
      await createCurrentUserProfile({ handle, region, primaryLocale });
      const next = sanitizeNextPath(searchParams.get('next')) ?? `/${locale}/write`;
      window.location.href = next;
    } catch {
      setError(t('signUpError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title={t('signUpTitle')}>
      {step === 'google' && (
        <>
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
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 14 }}>
            <OrganicButton variant="outline" onClick={() => startWith('google')}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <GoogleMark size={18} />
                {pending ? t('signingIn') : t('continueWithGoogle')}
              </span>
            </OrganicButton>
            {showApple && (
              <OrganicButton variant="outline" onClick={() => startWith('apple')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <AppleMark size={18} />
                  {pending ? t('signingIn') : t('continueWithApple')}
                </span>
              </OrganicButton>
            )}
          </div>
        </>
      )}

      {step === 'profile' && (
        <>
          <Field label={t('handleLabel')}>
            <OrganicInput
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value.slice(0, 20))}
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
              <option value="TW">🇹🇼 Taiwan</option>
              <option value="JP">🇯🇵 Japan</option>
              <option value="US">🇺🇸 United States</option>
              <option value="KR">🇰🇷 Korea</option>
              <option value="HK">🇭🇰 Hong Kong</option>
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
              <OrganicButton variant="primary" onClick={finish}>
                {pending ? t('creating') : t('finish')}
              </OrganicButton>
            </div>
          </div>
        </>
      )}

      {error && <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>}

      <p
        style={{
          marginTop: 24,
          paddingTop: 20,
          borderTop: '1px solid oklch(85% 0.02 75)',
          fontSize: 14,
          color: 'var(--color-text-muted)',
        }}
      >
        {t('switchToSignIn')}{' '}
        <Link
          href={`/signin${nextQuery(searchParams.get('next'))}`}
          style={{ color: 'var(--color-terracotta)' }}
        >
          {t('signIn')}
        </Link>
      </p>
    </AuthCard>
  );
}
