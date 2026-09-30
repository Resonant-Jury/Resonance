'use client';

import { Fragment } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { OrganicLink } from '@/components/atoms/OrganicLink/OrganicLink';

// Stand-ins the sentence is split on, so the links land wherever each language puts them.
const TERMS = '\u0000terms\u0000';
const PRIVACY = '\u0000privacy\u0000';

/**
 * "By continuing, you agree to the Terms of Use and the Privacy Policy" under
 * the sign-in buttons — App Store 1.2 asks that people agree to the terms
 * (with their zero-tolerance clause) before they can post.
 */
export function TermsConsent() {
  const t = useTranslations('auth');
  const locale = useLocale();
  const links: Record<string, React.ReactNode> = {
    [TERMS]: <OrganicLink href={`/${locale}/terms`}>{t('termsLink')}</OrganicLink>,
    [PRIVACY]: <OrganicLink href={`/${locale}/privacy`}>{t('privacyLink')}</OrganicLink>,
  };
  const parts = t('agreeTerms', { terms: TERMS, privacy: PRIVACY }).split(/(\u0000(?:terms|privacy)\u0000)/);
  return (
    <p style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-muted)', marginTop: 24 }}>
      {parts.map((part, i) => (
        <Fragment key={i}>{links[part] ?? part}</Fragment>
      ))}
    </p>
  );
}
