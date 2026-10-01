'use client';

import type { CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';

export interface LoadErrorProps {
  /** Read it again (SWR's `mutate()`, a route's `reset()`). */
  onRetry: () => void;
  style?: CSSProperties;
}

/**
 * A read that failed — offline, the server unavailable — rather than one that
 * found nothing: says so and offers to try again, where "not found" would
 * send the reader away from something that is there. Same words as the apps'
 * (`native.loadError` / `native.retry`).
 */
export function LoadError({ onRetry, style }: LoadErrorProps) {
  const t = useTranslations('native');
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 18,
        textAlign: 'center',
        ...style,
      }}
    >
      <p style={{ fontFamily: 'var(--font-heading)', fontSize: 22, color: 'var(--color-text)' }}>{t('loadError')}</p>
      <OrganicButton variant="outline" onClick={onRetry}>
        {t('retry')}
      </OrganicButton>
    </div>
  );
}
