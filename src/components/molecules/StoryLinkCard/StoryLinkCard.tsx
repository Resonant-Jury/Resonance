'use client';

import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { seedFromString } from '@/lib/design/prng';
import { INK_LIGHT } from '@/lib/design/strokes';
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

/**
 * - `outlined`: the card's light paper inside the pen line, which runs over
 *   the picture's top and side edges too — one frame, the picture flush to it.
 * - `filled`: no pen line; a block of the chat bubble's fill in the same
 *   wobbly outline, the picture running edge to edge across its top.
 */
export type StoryLinkCardVariant = 'outlined' | 'filled';

/** Each variant's paper, its hover wash and its pen (idle, pointed at), or none. */
const LOOKS: Record<StoryLinkCardVariant, { fill: string; wash: string; ink: string | null; inkHover: string | null }> = {
  outlined: {
    fill: 'var(--color-card-bg)',
    wash: 'var(--color-cream-dark)',
    ink: 'var(--field-border)',
    inkHover: 'var(--field-border-hover)',
  },
  filled: {
    fill: 'var(--bubble-theirs)',
    wash: 'var(--bubble-quote)',
    ink: null,
    inkHover: null,
  },
};

export interface StoryLinkCardProps {
  preview: LinkPreview;
  variant?: StoryLinkCardVariant;
}

/**
 * A link standing alone in a story, drawn as what its page says about itself
 * (the server's preview, lib/links/cardLinks): the page's picture when it has
 * one, its title, a line or two of description and the site's host — the
 * story-column sibling of a chat message's link preview.
 *
 * The picture runs across the card's top edge to edge, cut by the card's own
 * wobbly outline (the same seeded path as its fill, wash and pen), so the
 * card has one edge, not a frame around a framed picture; its foot meets the
 * words directly.
 *
 * The whole card is one link to the address, opened in a new tab without
 * our page as its opener or referrer. Its host is always the real one, in
 * ASCII (punycode for an international name), whatever the page called
 * itself; the picture comes only from our own `/api/link-image` route (the
 * server fetched it, never this browser), and a picture that fails to load
 * leaves no empty frame behind.
 */
export function StoryLinkCard({ preview, variant = 'outlined' }: StoryLinkCardProps) {
  const t = useTranslations('card.linkPreview');
  const titleId = useId();
  const ref = useRef<HTMLAnchorElement>(null);
  const { w, h } = useElementSize(ref);
  const [imageFailed, setImageFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const seed = seedFromString(preview.url);
  const look = LOOKS[variant];

  // The card's outline, measured: the fill, the hover wash, the picture's clip and the pen line all follow this one path.
  const shape = useMemo(() => {
    if (!w || !h) return null;
    const outline = { mag: autoMag(w, h), curve: autoCurve(w, h), segmentsH: autoSegments(w), segmentsV: autoSegments(h) };
    return { outline, d: wobRect(w, h, R, seed, outline.mag, outline) };
  }, [w, h, seed]);

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
      data-variant={variant}
      // A plain card of the same paper and pen until measured (the server's HTML).
      data-shape-pending={shape ? undefined : ''}
      style={
        {
          '--shape-fill': look.fill,
          '--shape-ink': look.ink ?? 'transparent',
          '--shape-ink-width': look.ink ? `${INK_LIGHT}px` : '0px',
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
          <HandDrawnBorder w={w} h={h} R={R} seed={seed} fillColor={look.fill} chalkSeed={seed + 1} {...shape.outline} />
          <BrushWash w={w} h={h} d={shape.d} color={look.wash} x={pointer.x} y={pointer.y} on={hovered} duration={460} />
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
      {shape && look.ink && (
        // The pen goes over the picture: its line is the picture's edge, not a second frame beside it.
        <span className={styles.pen} aria-hidden="true">
          <HandDrawnBorder
            w={w}
            h={h}
            R={R}
            seed={seed}
            strokeColor={hovered ? (look.inkHover ?? look.ink) : look.ink}
            strokeWidth={INK_LIGHT}
            {...shape.outline}
          />
        </span>
      )}
    </a>
  );
}
