'use client';

import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ProfileTabs, type TabKey } from '@/components/molecules/ProfileTabs/ProfileTabs';
import { InvitesInbox } from '@/components/molecules/InvitesInbox/InvitesInbox';
import { Link } from '@/i18n/navigation';
import { useMyCardBox, useMyProfile } from '@/lib/data/hooks';

const tabs: TabKey[] = ['published', 'private', 'draft', 'resonated', 'linked', 'bookmarks', 'thoughtMap'];

export default function MyCardBoxPage() {
  const locale = useLocale();
  const t = useTranslations('me');
  const { data: user } = useMyProfile();
  const { data: box } = useMyCardBox();

  return (
    <div
      style={{
        maxWidth: 'var(--page-max-w-wide)',
        margin: '0 auto',
        padding:
          'calc(var(--app-header-h) + var(--page-pad-top)) var(--page-pad-x) var(--page-pad-bottom)',
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
          src={user?.avatarUrl}
          initials={user?.initials ?? '··'}
          size={72}
          color={user?.accentColor ?? 'oklch(88% 0.08 55)'}
          seed={Number(user?.avatarSeed ?? 0)}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              {user?.handle ?? ' '}
            </h1>
            {user?.verified && <HandDrawnCheckmark size={16} />}
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-text-muted)',
              fontSize: 14,
              marginBottom: 4,
              fontStyle: user?.bio ? 'normal' : 'italic',
            }}
          >
            {user?.bio || t('bioEmpty')}
          </p>
          {user && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {t('joined', {
                date: new Date(user.joinedAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                }),
              })}
            </p>
          )}
        </div>
        <Link href="/settings" style={{ textDecoration: 'none' }}>
          <OrganicButton variant="ghost">{t('editProfile')}</OrganicButton>
        </Link>
      </header>

      <InvitesInbox />

      <ProfileTabs
        tabs={tabs}
        manageable
        thoughtMapHref="/me/thought-map"
        data={
          box
            ? {
                published: box.published,
                private: box.private,
                draft: box.draft,
                resonated: box.resonated,
                linked: box.linked,
                bookmarks: box.bookmarks,
              }
            : undefined
        }
        authors={box?.authors}
        loading={!box}
      />
    </div>
  );
}

