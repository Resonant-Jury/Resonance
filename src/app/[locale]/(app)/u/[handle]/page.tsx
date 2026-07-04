'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { OrganicButton } from '@/components/atoms/OrganicButton/OrganicButton';
import { Icon } from '@/components/atoms/Icon';
import { FeedSkeleton } from '@/components/atoms/CardSkeleton/CardSkeleton';
import { PageShell } from '@/components/molecules/PageShell/PageShell';
import { CardLinkGrid } from '@/components/molecules/CardLinkGrid/CardLinkGrid';
import { MiniCardGrid } from '@/components/molecules/MiniStoryCard/MiniCardGrid';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { useProfileByHandle } from '@/lib/data/hooks';
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
  const { data, isLoading } = useProfileByHandle(handle);

  if (isLoading) {
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

  const { user, isSelf, isConnected, published, linked, linkedAuthors } = data;
  const authors: Record<string, User> = { [user.id]: user };
  const joined = new Date(user.joinedAt).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
  });

  return (
    <PageShell width="wide">
      <header className={styles.hero}>
        <HandDrawnAvatar
          src={user.avatarUrl}
          initials={user.initials}
          size={96}
          color={user.accentColor}
          seed={Number(user.avatarSeed)}
        />

        <div className={styles.nameRow}>
          <h1 className={styles.name}>{user.handle}</h1>
          {user.verified && <HandDrawnCheckmark size={18} />}
        </div>

        <p className={`${styles.bio} ${user.bio ? '' : styles.bioEmpty}`}>
          {user.bio || t('bioEmpty')}
        </p>

        <div className={styles.meta}>
          {user.region && (
            <span className={styles.metaItem}>
              <Icon name="globe" size={14} />
              {user.region}
            </span>
          )}
          <span className={styles.metaItem}>
            <Icon name="cards" size={14} />
            {t('cardCount', { count: published.length })}
          </span>
          <span className={styles.metaItem}>{t('joined', { date: joined })}</span>
        </div>

        {/* Relationships grow from stories (design principle 3): connections
            start from a resonance/note notification, never from the profile
            page — so visitors see no connect button here. */}
        {(isSelf || isConnected) && (
          <div className={styles.actions}>
            {isSelf ? (
              <Link href="/settings" style={{ textDecoration: 'none' }}>
                <OrganicButton variant="ghost">{t('editProfile')}</OrganicButton>
              </Link>
            ) : (
              <span className={styles.connected}>✿ {t('connected')}</span>
            )}
          </div>
        )}
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>{t('publishedHeading')}</h2>
        {published.length > 0 ? (
          <CardLinkGrid cards={published} authors={authors} />
        ) : (
          <p className={styles.empty}>{t('emptyPublished')}</p>
        )}
      </section>

      {linked.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>{t('linkedCards')}</h2>
          <MiniCardGrid cards={linked} authors={linkedAuthors} />
        </section>
      )}
    </PageShell>
  );
}
