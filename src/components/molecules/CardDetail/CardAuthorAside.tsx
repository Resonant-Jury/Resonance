'use client';

import { useTranslations } from 'next-intl';
import useSWR from 'swr';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { Icon } from '@/components/atoms/Icon';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { isConnected } from '@/lib/db/firestore/client/reads';
import type { User } from '@/lib/db/types';
import styles from './CardAuthorAside.module.css';

export interface CardAuthorAsideProps {
  author: User;
  verifiedLabel: string;
  /**
   * Render the anonymous byline instead of the author (ux §6): neutral avatar,
   * no link to the profile, no region/bio. Applies to every viewer — the owner
   * sees exactly what the world sees, plus a private note that it's theirs.
   */
  anonymous?: boolean;
  /** The viewer is the (hidden) author — show the owner-only note. */
  isOwner?: boolean;
}

/** Author intro block for the card reading page (top of the right sidebar). */
export function CardAuthorAside({ author, verifiedLabel, anonymous, isOwner }: CardAuthorAsideProps) {
  const t = useTranslations('card');
  const tMsg = useTranslations('messages');
  const { user: viewer } = useAuth();

  // A quiet「傳訊息」exit for viewers already connected with the author —
  // strangers keep the note (小紙條) as their only door.
  const { data: connected } = useSWR(
    viewer && !anonymous && viewer.id !== author.id
      ? `connected:${[viewer.id, author.id].sort().join('_')}`
      : null,
    () => isConnected(viewer!.id, author.id),
  );

  if (anonymous) {
    return (
      <div className={styles.aside}>
        <HandDrawnAvatar initials="·" size={56} color="var(--color-cream-dark)" seed={97} />
        <div className={styles.info}>
          <div className={styles.name}>
            <span className={styles.handle}>{t('anonymousAuthor')}</span>
          </div>
          {isOwner && <p className={styles.bio}>{t('anonymousOwnerNote')}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.aside}>
      <Link href={`/u/${author.handle}`} className={styles.avatarLink} aria-label={author.handle}>
        <HandDrawnAvatar
          src={author.avatarUrl}
          initials={author.initials}
          size={56}
          color={author.accentColor}
          seed={Number(author.avatarSeed)}
        />
      </Link>
      <div className={styles.info}>
        <div className={styles.name}>
          <Link href={`/u/${author.handle}`} className={styles.handle}>
            {author.handle}
          </Link>
          {author.verified && <HandDrawnCheckmark size={14} title={verifiedLabel} />}
        </div>
        {author.region && <div className={styles.region}>{author.region}</div>}
        {author.bio && <p className={styles.bio}>{author.bio}</p>}
        {connected && (
          <Link href={`/messages/${author.handle}`} className={styles.messageLink}>
            <Icon name="chat" size={15} />
            {tMsg('messageLink')}
          </Link>
        )}
      </div>
    </div>
  );
}
