'use client';

import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
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
  const isMobile = useIsMobile(640);
  // From the card box, tapping your own avatar/name steps out to the public
  // profile — the page a connected reader would see.
  const publicHref = user ? (`/u/${user.handle}` as const) : undefined;

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
        {publicHref ? (
          <Link href={publicHref} style={{ display: 'flex', textDecoration: 'none' }} title={t('viewPublicProfile')}>
            <HandDrawnAvatar
              src={user?.avatarUrl}
              initials={user?.initials ?? '··'}
              size={72}
              color={user?.accentColor ?? 'oklch(88% 0.08 55)'}
              seed={Number(user?.avatarSeed ?? 0)}
            />
          </Link>
        ) : (
          <HandDrawnAvatar initials="··" size={72} color="oklch(88% 0.08 55)" seed={0} />
        )}
        {/* No min-width on phones — reserving 200px would push the edit chip
            onto its own row instead of keeping it at the right edge. */}
        <div style={{ flex: 1, minWidth: isMobile ? 0 : 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <h1
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 28,
                fontWeight: 700,
                color: 'var(--color-text)',
              }}
            >
              {publicHref ? (
                <Link
                  href={publicHref}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                  title={t('viewPublicProfile')}
                >
                  {user?.handle}
                </Link>
              ) : (
                ' '
              )}
            </h1>
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
        {/* Phones swap the labeled button for a compact pen chip so the
            identity row stays on one line (the pen is the app's own settings
            glyph — see the header Subnavbar). */}
        <Link href="/settings" style={{ textDecoration: 'none' }} title={t('editProfile')}>
          {isMobile ? (
            <OrganicButton variant="ghost" size="sm" style={{ padding: '9px 11px' }}>
              <Icon name="pen" size={17} ariaLabel={t('editProfile')} />
            </OrganicButton>
          ) : (
            <OrganicButton variant="ghost">{t('editProfile')}</OrganicButton>
          )}
        </Link>
      </header>

      <InvitesInbox />

      <ProfileTabs
        tabs={tabs}
        manageable
        thoughtMapHref="/me/thought-map"
        persistKey="me:cardbox-tab"
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

