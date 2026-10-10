'use client';

import { useEffect, useId, useRef } from 'react';
import { useImageRetry } from '@/lib/hooks/useImageRetry';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/atoms/Icon';
import type { LinkPreview } from '@/lib/db/types';
import { parseLink } from '@/lib/links/linkify';
import { useStoryBlock } from './useStoryBlock';
import styles from './StoryLinkCard.module.css';

export interface StoryLinkCardProps {
  preview: LinkPreview;
}

/**
 * A link standing alone in a story, drawn as what its page says about itself
 * (the server's preview, lib/links/cardLinks): the page's picture when it has
 * one, its title, a line or two of description and the site's host — the
 * story-column sibling of a chat message's link preview, in the chat card
 * bubble's language: a block of light fill in a seeded wobbly outline, with
 * no pen line around it.
 *
 * The picture runs across the card's top edge to edge, cut by the card's own
 * outline (the same seeded path as its fill and hover wash), so the card has
 * one edge, not a frame around a framed picture; its foot meets the words
 * directly. Without a picture: just the fill with the words.
 *
 * Its container (fill, outline, wash, stand-in) is `useStoryBlock`'s, which
 * an embedded Resonance card wears too.
 *
 * The whole card is one link to the address, opened in a new tab without
 * our page as its opener or referrer. Its host is always the real one, in
 * ASCII (punycode for an international name), whatever the page called
 * itself; the picture comes only from our own `/api/link-image` route (the
 * server fetched it, never this browser), and a picture that fails to load
 * leaves no empty frame behind.
 */
export function StoryLinkCard({ preview }: StoryLinkCardProps) {
  const t = useTranslations('card.linkPreview');
  const titleId = useId();
  const imageRef = useRef<HTMLImageElement>(null);
  const image = useImageRetry(preview.image);
  const block = useStoryBlock<HTMLAnchorElement>(preview.url);

  // The server's HTML starts loading the picture before the page comes alive,
  // and an error then reaches no handler: ask the picture itself once it is
  // (a broken one is complete with no width; one still loading, or a lazy
  // one not yet asked for, isn't complete).
  useEffect(() => {
    const img = imageRef.current;
    if (img?.complete && img.naturalWidth === 0) image.onError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview.image]);

  const link = parseLink(preview.url);
  if (!link) return null;
  const host = link.host.replace(/^www\./, '');
  // One that fails is hidden and asked for once more a little later (`useImageRetry`).
  const picture = preview.image && !image.hidden ? preview.image : null;

  return (
    <a
      ref={block.ref}
      {...block.rootProps}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label={t('open', { host })}
      aria-describedby={titleId}
    >
      {block.layers}
      {picture && (
        <span
          className={styles.picture}
          // The card's own outline cuts the picture's top and sides; its foot is the box's.
          style={block.d ? { clipPath: `path('${block.d}')` } : undefined}
          data-clipped={block.d ? '' : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- our own /api/link-image route, clipped by the card's outline */}
          <img
            key={image.attempt}
            ref={imageRef}
            className={styles.image}
            src={picture}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={image.onError}
          />
        </span>
      )}
      <span className={styles.text}>
        <span id={titleId} className={styles.title}>
          {preview.title}
        </span>
        {preview.description && <span className={styles.description}>{preview.description}</span>}
        <span className={styles.host}>
          <Icon name="link" size={15} />
          <span className={styles.hostName}>{host}</span>
        </span>
      </span>
    </a>
  );
}
