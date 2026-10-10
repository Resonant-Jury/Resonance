'use client';

import { useState, type CSSProperties } from 'react';
import { useTranslations } from 'next-intl';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { CARD_BORDERS, CARD_FILLS } from '@/components/molecules/StoryCard/StoryCard';
import { cardHueIndex, nearestCardHue } from '@/lib/design/dominantHue';
import { STORY_GRAIN } from '@/lib/design/grain';
import { Link } from '@/i18n/navigation';
import { plainExcerpt } from '@/lib/adapters/story';
import { readMinutes } from '@/lib/readTime';
import type { Card, User } from '@/lib/db/types';
import styles from './SharedCard.module.css';

/** A card's palette family (StoryCard's): by its cover's hue, or the first. */
function paletteOf(accentHue: number | undefined): number {
  const i = accentHue != null ? cardHueIndex(nearestCardHue(accentHue)) : -1;
  return i >= 0 ? i : 0;
}

export interface SharedCardContentProps {
  card: Card;
  /** Its author, or null for a card posted anonymously (never named here). */
  author: User | null;
  /** An id for the title, for a container that is labelled by it. */
  titleId?: string;
}

/**
 * A Resonance card as a shared post (Messenger's), so it reads at a glance as
 * a card of this site and what it is about: who wrote it (avatar, pen name,
 * and「共振 · 3 分鐘」under it), its cover edge to edge (or, without one, a
 * band of the card's own colour with grain and the wave), the title in the
 * heading face, the excerpt, and the source line — the wave and「共振」, like
 * the "Facebook" under a shared post. An anonymous card shows the anonymous
 * mark, never its author.
 *
 * Only the content: its container — a thread's bubble ({@link SharedCardPart}),
 * a story's block (CardEmbedLink) — is the one link that opens the card. The
 * cover and band reach `--shared-card-bleed` (4px) past the container's sides,
 * so the container's own wobbly edge, not the picture's, ends them.
 */
export function SharedCardContent({ card, author, titleId }: SharedCardContentProps) {
  const t = useTranslations('messages');
  const tApp = useTranslations('app');
  const tCard = useTranslations('card');
  const [coverFailed, setCoverFailed] = useState(false);
  // A card posted anonymously is never put to a name, even when its author is known here.
  const byline = card.anonymous ? null : author;
  const palette = paletteOf(card.accentHue);
  const cover = card.media?.url && !coverFailed ? card.media.url : null;
  // A summary's story is its plain excerpt and brings the whole story's read time along; a card read in full
  // (its summary didn't come) has its Markdown, to be read as words.
  const minutes = card.summary?.readMinutes ?? readMinutes(card.story);
  const meta = `${t('cardSource')} · ${tApp('readMinutes', { count: minutes })}`;
  const excerpt = card.summary ? card.story.replace(/\s+/g, ' ').trim() : plainExcerpt(card.story, 200);

  return (
    <>
      <span className={styles.head}>
        {byline ? (
          <HandDrawnAvatar
            src={byline.avatarUrl}
            initials={byline.initials}
            size={32}
            color={byline.accentColor}
            seed={Number(byline.avatarSeed) || 3}
          />
        ) : (
          <HandDrawnAvatar initials="·" size={32} color="var(--color-cream-dark)" seed={(card.id.charCodeAt(0) || 7) * 31} />
        )}
        <span className={styles.byline}>
          <span className={styles.author} data-anonymous={byline ? undefined : ''}>
            {byline ? byline.handle : tCard('anonymousAuthor')}
          </span>
          <span className={styles.meta}>{meta}</span>
        </span>
      </span>
      {cover ? (
        <span className={styles.cover}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
        </span>
      ) : (
        <span
          className={styles.band}
          style={{ '--band-fill': CARD_FILLS[palette], '--band-ink': CARD_BORDERS[palette][0] } as CSSProperties}
          aria-hidden
        >
          <GrainOverlay opacity={STORY_GRAIN.band} />
          <Icon name="wave" size={40} className={styles.bandWave} />
        </span>
      )}
      <span className={styles.text}>
        <span id={titleId} className={styles.title}>
          {card.thoughtCore}
        </span>
        {excerpt && <span className={styles.excerpt}>{excerpt}</span>}
      </span>
      <span className={styles.source}>
        <Icon name="wave" size={14} className={styles.sourceWave} />
        {t('cardSource')}
      </span>
    </>
  );
}

/**
 * The shared card's footprint while it is read: plain blocks where the byline,
 * cover, title and source will be — no wobble, nothing measured.
 */
export function SharedCardSkeletonContent() {
  return (
    <>
      <span className={styles.head}>
        <Skeleton circle width={32} />
        <span className={styles.byline}>
          <Skeleton width={88} height={12} />
          <Skeleton width={64} height={10} />
        </span>
      </span>
      <span className={styles.cover} data-skeleton />
      <span className={styles.text} data-busy="">
        <Skeleton width="85%" height={15} />
        <Skeleton width="60%" height={15} />
        <Skeleton width="90%" height={11} />
      </span>
      <span className={styles.source}>
        <Skeleton width={56} height={11} />
      </span>
    </>
  );
}

export interface SharedCardPartProps {
  card: Card;
  /** Its author, or null for a card posted anonymously (never named here). */
  author: User | null;
  /** False for the long-press copy, which only shows it. */
  interactive: boolean;
}

/** A Resonance card shared in a message, inside its bubble: {@link SharedCardContent} as one link that opens the card. */
export function SharedCardPart({ card, author, interactive }: SharedCardPartProps) {
  return (
    <Link
      href={`/card/${card.slug ?? card.id}` as `/card/${string}`}
      className={styles.part}
      tabIndex={interactive ? undefined : -1}
      onClick={interactive ? undefined : (e) => e.preventDefault()}
    >
      <SharedCardContent card={card} author={author} />
    </Link>
  );
}

/** The shared card's footprint in its bubble while it is read (its bubble stands in plain too). */
export function SharedCardSkeleton() {
  return (
    <span className={styles.part} aria-busy="true">
      <SharedCardSkeletonContent />
    </span>
  );
}
