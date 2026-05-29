import { getTranslations, setRequestLocale } from 'next-intl/server';
import { repos } from '@/lib/db';
import { SettingsClient } from './SettingsClient';

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('settings');
  const user = await repos.user.getCurrent();
  if (!user) throw new Error('no user');
  return (
    <div
      style={{
        maxWidth: 'var(--page-max-w)',
        margin: '0 auto',
        padding:
          'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
      }}
    >
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
      <SettingsClient
        initial={{
          handle: user.handle,
          bio: user.bio ?? '',
          region: user.region,
          primaryLocale: user.primaryLocale,
          autoTranslateTo: user.autoTranslateTo,
        }}
      />
    </div>
  );
}
