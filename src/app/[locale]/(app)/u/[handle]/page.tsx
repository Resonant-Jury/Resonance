'use client';

import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { ConnectInviteLauncher } from '@/components/molecules/ConnectInviteModal/ConnectInviteLauncher';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { useProfileByHandle } from '@/lib/data/hooks';

const wrapStyle = {
  maxWidth: 'var(--page-max-w-wide)',
  margin: '0 auto',
  padding:
    'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
} as const;

export default function OtherProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = params?.handle;
  const t = useTranslations('profile');
  const { data, isLoading } = useProfileByHandle(handle);

  if (isLoading) {
    return (
      <div style={wrapStyle}>
        <FeedSkeleton count={4} />
      </div>
    );
  }

  if (!data || !data.user) {
    return (
      <div style={{ ...wrapStyle, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 24, color: 'var(--color-text)', marginBottom: 12 }}>
          {t('notFound')}
        </p>
        <Link href="/home" style={{ textDecoration: 'none' }}>
          <span style={{ color: 'var(--color-terracotta)' }}>{t('backHome')}</span>
        </Link>
      </div>
    );
  }

  const { user, isConnected, published, dailyRemaining } = data;
  const preview = isConnected ? published : published.slice(0, 6);
  const authors: Record<string, User> = { [user.id]: user };

  return (
    <div style={wrapStyle}>
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
