'use client';

import { useEffect } from 'react';
import { LoadError } from '@/components/molecules/LoadError/LoadError';

/**
 * What a page that threw shows instead of nothing: every route under a locale
 * (the app's header and shell included) falls back to this, inside the
 * root layout's providers, so the reader can try again rather than face a
 * blank screen. The root layout's own failures go to app/global-error.tsx.
 */
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px var(--page-pad-x, 24px)',
        background: 'var(--color-cream)',
      }}
    >
      <LoadError onRetry={reset} />
    </main>
  );
}
