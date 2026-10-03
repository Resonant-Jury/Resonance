'use client';

import { useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { seedFromString } from '@/lib/design/prng';
import { INK_LIGHT } from '@/lib/design/strokes';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { wobRect } from '@/lib/design/wobRect';
import type { LinkPreview } from '@/lib/db/types';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { parseLink } from '@/lib/links/linkify';
import styles from './StoryLinkCard.module.css';

const R = 16;
/** The card's paper, its hover wash and its pen (idle, pointed at). */
const FILL = 'var(--color-card-bg)';
const WASH = 'var(--color-cream-dark)';
const INK_COLOR = 'var(--field-border)';
const INK_HOVER = 'var(--field-border-hover)';

export interface StoryLinkCardProps {
  preview: LinkPreview;
}

/**
 * A link standing alone in a story, drawn as what its page says about itself
 * (the server's preview, lib/links/cardLinks): the page's picture when it has
 * one, its title, a line or two of description and the site's host — the
 * story-column sibling of a chat message's link preview, in the hand-drawn
 * card of an embedded story card.
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
  const { w, h } = useElementSize(ref);
  const [imageFailed, setImageFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const seed = seedFromString(preview.url);

  // The card's outline, measured: the fill, the hover wash and the pen line all follow this one path.
  const shape = useMemo(() => {
    if (!w || !h) return null;
    const outline = { mag: autoMag(w, h), curve: autoCurve(w, h), segmentsH: autoSegments(w), segmentsV: autoSegments(h) };
    return { outline, d: wobRect(w, h, R, seed, outline.mag, outline) };
  }, [w, h, seed]);

  const link = parseLink(preview.url);
  if (!link) return null;
  const host = link.host.replace(/^www\./, '');

  const track = (e: MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <a
      ref={ref}
      className={`${styles.card} res-shape-stand-in`}
      // A plain card of the same paper and pen until measured (the server's HTML).
      data-shape-pending={shape ? undefined : ''}
      style={
        {
          '--shape-fill': FILL,
          '--shape-ink': INK_COLOR,
          '--shape-ink-width': `${INK_LIGHT}px`,
          '--shape-radius': `${R}px`,
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
          <HandDrawnBorder
            w={w}
            h={h}
            R={R}
            seed={seed}
            strokeColor={hovered ? INK_HOVER : INK_COLOR}
            strokeWidth={INK_LIGHT}
            {...shape.outline}
          />
        </>
      )}
      {preview.image && !imageFailed && (
        <span className={styles.picture}>
          <OrganicImage seed={seed + 3} R={12} ratio={1 / 1.91}>
            {/* eslint-disable-next-line @next/next/no-img-element -- our own /api/link-image route, clipped organically */}
            <img
              className={styles.image}
              src={preview.image}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          </OrganicImage>
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
