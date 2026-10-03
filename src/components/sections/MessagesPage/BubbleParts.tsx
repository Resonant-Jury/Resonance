'use client';

import { useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { CARD_BORDERS, CARD_FILLS } from '@/components/molecules/StoryCard/StoryCard';
import { cardHueIndex, nearestCardHue } from '@/lib/design/dominantHue';
import { STORY_GRAIN } from '@/lib/design/grain';
import { Link } from '@/i18n/navigation';
import type { Card, MessageLinkPreview, User } from '@/lib/db/types';
import type { MessageLink } from './MessageBubble';
import styles from './Thread.module.css';

export interface LinkPreviewPartProps {
  preview: MessageLinkPreview;
  /** The preview's address, as the link rules normalized it. */
  link: MessageLink;
  /** The message's words are above it: the picture keeps a step from them (without them it starts at the bubble's top edge). */
  afterWords: boolean;
  /** A click on it; null for the long-press copy, which only shows it. */
  onLink: ((link: MessageLink, e: MouseEvent<HTMLAnchorElement>) => void) | null;
}

/**
 * A link's unfurled page inside its message's bubble (Messenger's): after the
 * words, the page's picture edge to edge at 1.91:1 — when it has one and it
 * loads; one that won't takes its section with it — then the title, a line
 * of description and the host with the link glyph. The host is the real one
 * the click leads to, in ASCII (punycode for an international name); the
 * picture only ever comes from our own `/api/link-image` route (the server
 * fetched it, never this browser).
 */
export function LinkPreviewPart({ preview, link, afterWords, onLink }: LinkPreviewPartProps) {
  const [pictureFailed, setPictureFailed] = useState(false);
  const host = link.host.replace(/^www\./, '');
  return (
    <a
      className={styles.previewPart}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      data-link-url={link.url}
      tabIndex={onLink === null ? -1 : undefined}
      onClick={(e) => {
        if (onLink === null) e.preventDefault();
        else onLink(link, e);
      }}
    >
      {preview.image && !pictureFailed && (
        <span className={styles.picture} data-after-words={afterWords || undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.image}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setPictureFailed(true)}
          />
        </span>
      )}
      <span className={styles.previewBody}>
        <span className={styles.previewTitle}>{preview.title}</span>
        {preview.description && <span className={styles.previewDescription}>{preview.description}</span>}
        <span className={styles.previewHost}>
          <Icon name="link" size={12} />
          <span className={styles.ellipsis}>{host}</span>
        </span>
      </span>
    </a>
  );
}

/** A card's palette family (StoryCard's): by its cover's hue, or the first. */
function paletteOf(accentHue: number | undefined): number {
  const i = accentHue != null ? cardHueIndex(nearestCardHue(accentHue)) : -1;
  return i >= 0 ? i : 0;
}

export interface SharedCardPartProps {
  card: Card;
  /** Its author, or null for a card posted anonymously (never named here). */
  author: User | null;
  /** False for the long-press copy, which only shows it. */
  interactive: boolean;
}

/**
 * A Resonance card shared in a message, inside its bubble — Messenger's
 * shared post, so it reads at a glance as a card of this site and what it is
 * about: who wrote it (avatar, pen name, and「共振 · 3 分鐘」under it), its
 * cover edge to edge (or, without one, a band of the card's own colour with
 * the wave), the title in the heading face, the excerpt, and the source line
 * — the wave and「共振」, like the "Facebook" under a shared post. A click
 * opens the card. An anonymous card shows the anonymous mark, never its author.
 */
export function SharedCardPart({ card, author, interactive }: SharedCardPartProps) {
  const t = useTranslations('messages');
  const tApp = useTranslations('app');
  const tCard = useTranslations('card');
  const [coverFailed, setCoverFailed] = useState(false);
  // A card posted anonymously is never put to a name, even when its author is known here.
  const byline = card.anonymous ? null : author;
  const palette = paletteOf(card.accentHue);
  const cover = card.media?.url && !coverFailed ? card.media.url : null;
  const minutes = card.summary?.readMinutes;
  const meta = minutes != null ? `${t('cardSource')} · ${tApp('readMinutes', { count: minutes })}` : t('cardSource');
  const excerpt = card.story.replace(/\s+/g, ' ').trim();

  return (
    <Link
      href={`/card/${card.slug ?? card.id}` as `/card/${string}`}
      className={styles.cardPart}
      tabIndex={interactive ? undefined : -1}
      onClick={interactive ? undefined : (e) => e.preventDefault()}
    >
      <span className={styles.cardHead}>
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
        <span className={styles.cardByline}>
          <span className={styles.cardAuthor} data-anonymous={byline ? undefined : ''}>
            {byline ? byline.handle : tCard('anonymousAuthor')}
          </span>
          <span className={styles.cardMeta}>{meta}</span>
        </span>
      </span>
      {cover ? (
        <span className={styles.picture}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" loading="lazy" decoding="async" onError={() => setCoverFailed(true)} />
        </span>
      ) : (
        <span
          className={styles.cardBand}
          style={{ '--band-fill': CARD_FILLS[palette], '--band-ink': CARD_BORDERS[palette][0] } as CSSProperties}
          aria-hidden
        >
          <GrainOverlay opacity={STORY_GRAIN.band} />
          <Icon name="wave" size={40} className={styles.cardBandWave} />
        </span>
      )}
      <span className={styles.cardText}>
        <span className={styles.cardTitle}>{card.thoughtCore}</span>
        {excerpt && <span className={styles.cardExcerpt}>{excerpt}</span>}
      </span>
      <span className={styles.cardSource}>
        <Icon name="wave" size={14} className={styles.cardSourceWave} />
        {t('cardSource')}
      </span>
    </Link>
  );
}

/**
 * The shared card's footprint while it is read: plain blocks where the byline,
 * cover, title and source will be — no wobble, nothing measured (its bubble
 * stands in plain too).
 */
export function SharedCardSkeleton() {
  return (
    <span className={styles.cardPart} aria-busy="true">
      <span className={styles.cardHead}>
        <Skeleton circle width={32} />
        <span className={styles.cardByline}>
          <Skeleton width={88} height={12} />
          <Skeleton width={64} height={10} />
        </span>
      </span>
      <span className={styles.picture} data-skeleton />
      <span className={styles.cardText}>
        <Skeleton width="85%" height={15} />
        <Skeleton width="60%" height={15} />
        <Skeleton width="90%" height={11} />
      </span>
      <span className={styles.cardSource}>
        <Skeleton width={56} height={11} />
      </span>
    </span>
  );
}
