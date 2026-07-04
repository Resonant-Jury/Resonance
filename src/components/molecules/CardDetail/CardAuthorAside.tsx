'use client';

import { useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { Link } from '@/i18n/navigation';
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
      </div>
    </div>
  );
}
