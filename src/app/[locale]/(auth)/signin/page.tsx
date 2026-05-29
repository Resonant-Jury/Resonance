'use client';

import { Suspense, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { AuthCard } from '@/components/molecules/AuthCard/AuthCard';
import { GoogleMark } from '@/components/atoms/GoogleMark/GoogleMark';
import { useAuth } from '@/components/providers/AuthProvider';
import { sanitizeNextPath } from '@/lib/auth/nextPath';

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInPageInner />
    </Suspense>
  );
}

function SignInPageInner() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signInWithGoogle() {
    setPending(true);
    setError(null);
    try {
      await auth.signInWithGoogle();
      const next = sanitizeNextPath(searchParams.get('next')) ?? `/${locale}/home`;
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
      <OrganicButton variant="outline" onClick={signInWithGoogle}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <GoogleMark size={18} />
          {pending ? t('signingIn') : t('continueWithGoogle')}
        </span>
      </OrganicButton>
      {error && (
        <p style={{ color: 'var(--color-terracotta)', fontSize: 13, marginTop: 12 }}>{error}</p>
      )}
    </AuthCard>
  );
}
