'use client';

import { useLocale, useTranslations } from 'next-intl';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { HandDrawnCheckmark } from '@/components/atoms/HandDrawnCheckmark/HandDrawnCheckmark';
import { SquareFlag } from '@/components/atoms/SquareFlag/SquareFlag';
import { Link } from '@/i18n/navigation';
import type { User } from '@/lib/db/types';
import { regionCode, regionDisplayName, squareFlagCode } from '@/lib/regionName';
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
  /** When the card was published, as the page formats it (CardDetailClient's `publishedDate`). */
  published?: CardPublished | null;
}

export interface CardPublished {
  /** ISO 8601, for `<time dateTime>`. */
  dateTime: string;
  /** The date in the reader's language, with its year (2026年10月10日, Oct 10, 2026). */
  label: string;
}

/**
 * The author's region as a small square flag right after the pen name — a quiet
 * mark, not a line of its own; its name is the tooltip and the accessible name.
 * Nothing for a region without vendored flag art.
 */
export function AuthorRegionFlag({ region, size = 15 }: { region?: string | null; size?: number }) {
  const locale = useLocale();
  const code = region ? squareFlagCode(region) : null;
  if (!region || !code) return null;
  const name = regionDisplayName(regionCode(region), locale);
  return (
    <span title={name} style={{ display: 'inline-flex' }}>
      <SquareFlag code={code} size={size} label={name} />
    </span>
  );
}

/** The card's published date under the byline. */
export function CardPublishedDate({ published, className }: { published?: CardPublished | null; className?: string }) {
  if (!published) return null;
  return (
    <time dateTime={published.dateTime} className={className}>
      {published.label}
    </time>
  );
}

/**
 * Author intro block for the card reading page (top of the right sidebar).
 * It offers no「傳訊息」: a card page is for reading and answering the card
 * (a note, a resonance) — a conversation starts from the person's profile or
 * the Messages tab, for a connected reader as for anyone.
 */
export function CardAuthorAside({ author, verifiedLabel, anonymous, isOwner, published }: CardAuthorAsideProps) {
  const t = useTranslations('card');

  if (anonymous) {
    return (
      <div className={styles.aside}>
        <HandDrawnAvatar initials="·" size={56} color="var(--color-cream-dark)" seed={97} />
        <div className={styles.info}>
          <div className={styles.name}>
            <span className={styles.handle}>{t('anonymousAuthor')}</span>
          </div>
          <CardPublishedDate published={published} className={styles.date} />
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
          <AuthorRegionFlag region={author.region} />
          {author.verified && <HandDrawnCheckmark size={14} title={verifiedLabel} />}
        </div>
        <CardPublishedDate published={published} className={styles.date} />
        {author.bio && <p className={styles.bio}>{author.bio}</p>}
      </div>
    </div>
  );
}
