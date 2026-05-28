import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CURRENT_USER_ID, repos } from '@/lib/db';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { ProfileTabs, type TabKey } from '@/components/molecules/ProfileTabs/ProfileTabs';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';

export default async function MyCardBoxPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('me');
  const user = await repos.user.getCurrent();
  if (!user) throw new Error('No user');

  const [published, privateCards, drafts, resonated] = await Promise.all([
    repos.card.findByAuthor(CURRENT_USER_ID, 'published'),
    repos.card.findByAuthor(CURRENT_USER_ID, 'private'),
    repos.card.findByAuthor(CURRENT_USER_ID, 'draft'),
    repos.card.findByAuthor(CURRENT_USER_ID, 'resonated'),
  ]);

  const all = [...published, ...privateCards, ...drafts, ...resonated];
  const authorIds = Array.from(new Set(all.map((c) => c.authorId)));
  const authorList = await Promise.all(authorIds.map((id) => repos.user.findById(id)));
  const authors: Record<string, User> = {};
  for (const u of authorList) if (u) authors[u.id] = u;

  const tabs: TabKey[] = ['published', 'private', 'draft', 'resonated', 'thoughtMap'];

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
                color: 'var(--color-text)',
              }}
            >
              {user.handle}
            </h1>
            {user.verified && <HandDrawnCheckmark size={16} />}
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              color: 'var(--color-text-muted)',
              fontSize: 14,
              marginBottom: 4,
              fontStyle: user.bio ? 'normal' : 'italic',
            }}
          >
            {user.bio || t('bioEmpty')}
          </p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {t('joined', {
              date: new Date(user.joinedAt).toLocaleDateString(locale, {
                year: 'numeric',
                month: 'long',
              }),
            })}
          </p>
        </div>
        <Link href="/settings" style={{ textDecoration: 'none' }}>
          <OrganicButton variant="ghost">{t('editProfile')}</OrganicButton>
        </Link>
      </header>

      <ProfileTabs
        tabs={tabs}
        data={{ published, private: privateCards, draft: drafts, resonated }}
        authors={authors}
      />
    </div>
  );
}
