'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { PageShell } from '@/components/molecules/PageShell/PageShell';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { useProfileByHandle, useProfileCards, useProfileLinks } from '@/lib/data/hooks';
import { useAuth } from '@/components/providers/AuthProvider';
import { BlockedNotice, ProfileSafetyMenu } from './ProfileSafety';
import { regionDisplayName } from '@/lib/regionName';
import styles from './page.module.css';

/** Route segments arrive percent-encoded (e.g. a CJK handle like `念誠` →
 * `%E5%BF%B5%E8%AA%A0`); decode before matching it against stored handles. */
function decodeHandle(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function PublicProfilePage() {
  const params = useParams<{ handle: string }>();
  const handle = decodeHandle(params?.handle);
  const locale = useLocale();
  const t = useTranslations('profile');
  const tMsg = useTranslations('messages');
  const { user: viewer } = useAuth();
  // Three reads side by side once the handle names someone: the viewer's
  // standing with them (blocks + connection), their cards, and the cards
  // linking to theirs. The page waits for the first two (the hero counts the
  // cards); the links arrive when they do.
  const { data, isLoading } = useProfileByHandle(handle);
  const { data: published, error: cardsError } = useProfileCards(handle);
  const { data: links } = useProfileLinks(handle);
  const cardsPending = !!data?.user && !data.isBlocked && published === undefined && !cardsError;

  if (isLoading || cardsPending) {
    return (
      <PageShell width="wide">
        <div className={styles.hero} role="status" aria-label="Loading profile">
          <div className={`${styles.skelBlock} ${styles.skelAvatar}`} />
          <div className={`${styles.skelBlock} ${styles.skelName}`} />
          <div className={`${styles.skelBlock} ${styles.skelBio}`} />
          <div className={`${styles.skelBlock} ${styles.skelBioShort}`} />
          <div className={`${styles.skelBlock} ${styles.skelMeta}`} />
        </div>
        <div className={styles.section}>
          <FeedSkeleton count={4} />
        </div>
      </PageShell>
    );
  }

  if (!data || !data.user) {
    return (
      <PageShell width="wide">
        <div className={styles.notFound}>
          <p className={styles.notFoundTitle}>{t('notFound')}</p>
          <Link href="/home" className={styles.backLink}>
            {t('backHome')}
          </Link>
        </div>
      </PageShell>
    );
  }

  const { user, isSelf, isConnected, isBlocked } = data;
  // Someone the viewer blocked shows none of their cards, nor what links to them.
  const cards = isBlocked ? [] : (published ?? []);
  const linked = isBlocked ? [] : (links?.cards ?? []);
  const authors: Record<string, User> = { [user.id]: user };
  const joined = new Date(user.joinedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <PageShell width="wide">
      <header className={styles.hero}>
        {/* Report / block lives in the corner for signed-in visitors only —
            it's a safety valve, not part of the page's story. */}
        {viewer && !isSelf && <ProfileSafetyMenu user={user} isBlocked={isBlocked} />}
        <HandDrawnAvatar
          src={user.avatarUrl}
          initials={user.initials}
          size={96}
          color={user.accentColor}
          seed={Number(user.avatarSeed)}
        />

        <div className={styles.nameRow}>
          <h1 className={styles.name}>{user.handle}</h1>
        </div>

        <p className={`${styles.bio} ${user.bio ? '' : styles.bioEmpty}`}>
          {user.bio || t('bioEmpty')}
        </p>

        <div className={styles.meta}>
          {user.region && (
            <span className={styles.metaItem}>
              <SquareFlag code={user.region.toLowerCase()} size={16} />
              {regionDisplayName(user.region, locale)}
            </span>
          )}
          <span className={styles.metaItem}>
            <Icon name="cards" size={14} />
            {t('cardCount', { count: cards.length })}
          </span>
          <span className={styles.metaItem}>{t('joined', { date: joined })}</span>
          {/* Relationship mark: a person + tick instead of a "Connected" label —
              the icon states the fact, the tooltip explains it. */}
          {!isSelf && isConnected && (
            <span className={styles.metaItem} title={t('connected')}>
              <Icon
                name="user-check"
                size={16}
                color="var(--color-terracotta)"
                ariaLabel={t('connected')}
              />
            </span>
          )}
        </div>

        {/* Relationships grow from stories (design principle 3): connections
            start from a resonance/note notification, never from the profile
            page — so visitors see no connect button here. */}
        {!isBlocked && (isSelf || isConnected) && (
          <div className={styles.actions}>
            {isSelf ? (
              <Link href="/settings" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="ghost">{t('editProfile')}</OrganicButton>
              </Link>
            ) : (
              /* The connection is live — the conversation is one click away. */
              <Link href={`/messages/${user.handle}`} style={{ textDecoration: 'none' }}>
                <OrganicButton variant="ghost" size="sm">
                  <Icon name="chat" size={15} />
                  {tMsg('messageLink')}
                </OrganicButton>
              </Link>
            )}
          </div>
        )}
      </header>

      {isBlocked && <BlockedNotice user={user} />}

      {/* Visitors with nothing to browse see no section at all — the hero's
          card-count line already states the fact, so a heading over an empty
          state would just restate it. The owner keeps the teaching moment. */}
      {!isBlocked && (cards.length > 0 || isSelf) && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t('publishedHeading')}</h2>
          {cards.length > 0 ? (
            <CardLinkGrid cards={cards} authors={authors} />
          ) : (
            // The owner's empty profile teaches instead of apologizing (ux §4).
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
              <p className={styles.empty} style={{ padding: 0 }}>
                {t('emptyPublishedSelf')}
              </p>
              <Link href="/write" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="primary">{t('emptyPublishedCta')}</OrganicButton>
              </Link>
            </div>
          )}
        </section>
      )}

      {linked.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t('linkedCards')}</h2>
          <MiniCardGrid cards={linked} authors={links?.authors ?? {}} />
        </section>
      )}
    </PageShell>
  );
}
