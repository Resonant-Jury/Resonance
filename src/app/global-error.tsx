'use client';

import { useEffect, useState } from 'react';

interface Copy {
  loadError: string;
  retry: string;
}

/**
 * The root layout itself failed ([locale]/layout.tsx: its providers), so
 * nothing it sets up is here — no translations, no fonts, maybe no styles.
 * This brings its own: the apps' load-error words for the locale in the URL
 * (loaded only now), and a reload, since the layout has to start over.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<'en' | 'zh-TW'>('en');
  const [copy, setCopy] = useState<Copy | null>(null);

  useEffect(() => {
    console.error(error);
    const zh = window.location.pathname.startsWith('/zh-TW');
    setLang(zh ? 'zh-TW' : 'en');
    (zh ? import('@/messages/zh-TW.json') : import('@/messages/en.json'))
      .then((m) => setCopy(m.default.native))
      .catch(() => setCopy({ loadError: '', retry: '↻' }));
  }, [error]);

  return (
    <html lang={lang}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 24px',
          boxSizing: 'border-box',
          background: 'var(--color-cream, #faf2e9)',
          color: 'var(--color-text, #3d2f24)',
          fontFamily: 'var(--font-body, system-ui, sans-serif)',
          textAlign: 'center',
        }}
      >
        {copy && (
          <div role="alert" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
            {copy.loadError && <p style={{ margin: 0, fontSize: 20 }}>{copy.loadError}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '12px 28px',
                borderRadius: 16,
                border: '1.5px solid var(--color-terracotta, #c2643f)',
                background: 'transparent',
                color: 'var(--color-terracotta, #c2643f)',
                font: 'inherit',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {copy.retry}
            </button>
          </div>
        )}
      </body>
    </html>
  );
}
