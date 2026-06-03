'use client';

import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import styles from './CardAuthorAside.module.css';

/** Author intro block for the card reading page (top of the right sidebar). */
export function CardAuthorAside({ author, verifiedLabel }: { author: User; verifiedLabel: string }) {
  return (
    <div className={styles.aside}>
      <Link href={`/u/${author.handle}`} className={styles.avatarLink} aria-label={author.handle}>
        <HandDrawnAvatar
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
