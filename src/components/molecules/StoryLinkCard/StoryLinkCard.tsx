'use client';

import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { seedFromString } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { wobRect } from '@/lib/design/wobRect';
import type { LinkPreview } from '@/lib/db/types';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { parseLink } from '@/lib/links/linkify';
import styles from './StoryLinkCard.module.css';

const R = 16;
/**
 * How far the picture reaches past the card's box on its top and sides, so
 * the outline's outward swings (a few px at most) still land on picture.
 */
const BLEED = 8;
/** The card's fill (the chat's card bubble's) and its hover wash. No pen line: the fill is its edge. */
const FILL = 'var(--bubble-theirs)';
const WASH = 'var(--bubble-quote)';

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
  const ref = useRef<HTMLAnchorElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const { w, h } = useElementSize(ref);
  const [imageFailed, setImageFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const seed = seedFromString(preview.url);

  // The card's outline, measured: the fill, the hover wash and the picture's clip all follow this one path.
  const shape = useMemo(() => {
    if (!w || !h) return null;
    const outline = { mag: autoMag(w, h), curve: autoCurve(w, h), segmentsH: autoSegments(w), segmentsV: autoSegments(h) };
    return { outline, d: wobRect(w, h, R, seed, outline.mag, outline) };
  }, [w, h, seed]);

  // The server's HTML starts loading the picture before the page comes alive,
  // and an error then reaches no handler: ask the picture itself once it is
  // (a broken one is complete with no width; one still loading, or a lazy
  // one not yet asked for, isn't complete).
  useEffect(() => {
    const img = imageRef.current;
    if (img?.complete && img.naturalWidth === 0) setImageFailed(true);
  }, [preview.image]);

  const link = parseLink(preview.url);
  if (!link) return null;
  const host = link.host.replace(/^www\./, '');
  const picture = preview.image && !imageFailed ? preview.image : null;

  const track = (e: MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <a
      ref={ref}
      className={`${styles.card} res-shape-stand-in`}
      // A plain rounded block of the same fill until measured (the server's HTML).
      data-shape-pending={shape ? undefined : ''}
      style={
        {
          '--shape-fill': FILL,
          '--shape-radius': `${R}px`,
          '--picture-bleed': `${BLEED}px`,
        } as CSSProperties
      }
      href={link.url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      aria-label={t('open', { host })}
      aria-describedby={titleId}
      onMouseEnter={(e) => {
        track(e);
        setHovered(true);
      }}
      onMouseLeave={(e) => {
        track(e);
        setHovered(false);
      }}
    >
      {shape && (
        <>
          <HandDrawnBorder w={w} h={h} R={R} seed={seed} fillColor={FILL} chalkSeed={seed + 1} {...shape.outline} />
          <BrushWash w={w} h={h} d={shape.d} color={WASH} x={pointer.x} y={pointer.y} on={hovered} duration={460} />
        </>
      )}
      {picture && (
        <span
          className={styles.picture}
          // The card's own outline cuts the picture's top and sides; its foot is the box's.
          style={shape ? { clipPath: `path('${shape.d}')` } : undefined}
          data-clipped={shape ? '' : undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- our own /api/link-image route, clipped by the card's outline */}
          <img
            ref={imageRef}
            className={styles.image}
            src={picture}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
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
