'use client';

import { useTranslations } from 'next-intl';
import { SketchLoader } from '@/components/atoms/SketchLoader/SketchLoader';
import { useMyProfile } from '@/lib/data/hooks';
import { SettingsClient } from './SettingsClient';

// No server-side data on the hot path: the page shell is static, and the
// profile loads client-direct from Firestore (AppShell already gates the
// signed-out case) — clicking「設定」paints immediately instead of waiting on
// a server function.
export default function SettingsPage() {
  const t = useTranslations('settings');
  const { data: user } = useMyProfile();

  return (
    <div
      style={{
        maxWidth: 'var(--page-max-w)',
        margin: '0 auto',
        padding:
          'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
      }}
    >
      {/* The loaded state renders its own title inside the settings grid (left
          column, above the section nav) so the content column can start at the
          title's height. Only the loading shell titles itself here. */}
      {user ? (
        <SettingsClient
          initial={{
            handle: user.handle,
            bio: user.bio ?? '',
            region: user.region,
            primaryLocale: user.primaryLocale,
            autoTranslateTo: user.autoTranslateTo,
            avatarUrl: user.avatarUrl,
            initials: user.initials,
            accentColor: user.accentColor,
          }}
        />
      ) : (
        <>
          <h1
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: 'clamp(28px, 4vw, 36px)',
              fontWeight: 700,
              marginBottom: 32,
            }}
          >
            {t('title')}
          </h1>
          <div
            style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}
            aria-busy="true"
          >
            <SketchLoader />
          </div>
        </>
      )}
    </div>
  );
}
