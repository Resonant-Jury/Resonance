import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CURRENT_USER_ID, repos } from '@/lib/db';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { ConnectInviteLauncher } from '@/components/molecules/ConnectInviteModal/ConnectInviteLauncher';
import type { User } from '@/lib/db/types';

export default async function OtherProfilePage({
  params,
}: {
  params: Promise<{ locale: string; handle: string }>;
}) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('profile');
  const user = await repos.user.findByHandle(handle);
  if (!user) notFound();
  if (user.id === CURRENT_USER_ID) notFound();

  const [isConnected, published, dailyRemaining] = await Promise.all([
    repos.connection.isConnected(CURRENT_USER_ID, user.id),
    repos.card.findByAuthor(user.id, 'published'),
    repos.invite.remainingDailyQuota(CURRENT_USER_ID),
  ]);

  const preview = isConnected ? published : published.slice(0, 6);
  const authors: Record<string, User> = { [user.id]: user };

  return (
    <div
      style={{
        maxWidth: 1200,
        margin: '0 auto',
        padding: 'clamp(32px, 5vw, 56px) clamp(20px, 4vw, 48px) 80px',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginBottom: 40,
          flexWrap: 'wrap',
        }}
      >
        <HandDrawnAvatar
          initials={user.initials}
          size={72}
          color={user.accentColor}
          seed={Number(user.avatarSeed)}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 28,
                fontWeight: 700,
              }}
            >
              {user.handle}
            </h1>
            {user.verified && <HandDrawnCheckmark size={16} />}
          </div>
          <p
            style={{
              color: 'var(--color-text-muted)',
              fontSize: 14,
              marginBottom: 4,
            }}
          >
            {user.bio}
          </p>
          <p
            style={{
              fontSize: 12,
              color: isConnected
                ? 'var(--color-sage, oklch(55% 0.13 140))'
                : 'var(--color-text-muted)',
              fontWeight: isConnected ? 600 : 400,
            }}
          >
            {isConnected ? `✿ ${t('connected')}` : t('notConnected')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {isConnected ? (
            <OrganicButton variant="outline">{t('message')}</OrganicButton>
          ) : (
            <ConnectInviteLauncher
              targetUser={{
                id: user.id,
                handle: user.handle,
                initials: user.initials,
                accentColor: user.accentColor,
              }}
              dailyRemaining={dailyRemaining}
              variant="primary"
              label={t('initiateConnect')}
            />
          )}
        </div>
      </header>

      {preview.length > 0 && <CardLinkGrid cards={preview} authors={authors} />}

      {!isConnected && published.length > 6 && (
        <div
          style={{
            marginTop: 48,
            padding: '40px 24px',
            textAlign: 'center',
            borderRadius: 20,
            background: 'oklch(94% 0.03 75 / 0.5)',
            color: 'var(--color-text-muted)',
          }}
        >
          <p style={{ fontFamily: 'var(--font-heading)', fontSize: 18, marginBottom: 6 }}>
            {t('softLock')}
          </p>
        </div>
      )}
    </div>
  );
}
