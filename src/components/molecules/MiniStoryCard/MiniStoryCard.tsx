'use client';

import { useMemo, useRef, useState, useId, type MouseEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wobRect } from '@/lib/design/wobRect';
import { wavyLine } from '@/lib/design/wavyPath';
import { INK } from '@/lib/design/strokes';
import styles from './MiniStoryCard.module.css';

const CARD_BORDERS = [
  'oklch(52% 0.13 55)',
  'oklch(54% 0.10 290)',
  'oklch(50% 0.12 140)',
  'oklch(58% 0.14 88)',
  'oklch(50% 0.10 215)',
  'oklch(52% 0.09 18)',
];
const CARD_HUES = [55, 290, 140, 88, 215, 18];

export interface MiniStoryCardProps {
  title: string;
  author: string;
  authorInitials: string;
  authorAccent?: string;
  authorSeed?: number;
  imageUrl?: string;
  imageLabel?: string;
  index?: number;
  isLast?: boolean;
}

/**
 * A pared-back story card — image, title, author only. No excerpt, no tags, no
 * read-time. Used in the "linked cards" surfaces (card detail + profile). Stays
 * clickable (its grid wraps it in a Link). Follows the same organic chrome and
 * mobile-bleed degradation as {@link StoryCard}.
 */
export function MiniStoryCard({
  title,
  author,
  authorInitials,
  authorAccent,
  authorSeed,
  imageUrl,
  imageLabel,
  index = 0,
  isLast = false,
}: MiniStoryCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(cardRef, 320, 320);
  const isMobile = useIsMobile();
  const maskId = useId().replace(/:/g, '');

  const recordPointer = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const maxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 6;

  const bc1 = CARD_BORDERS[index % CARD_BORDERS.length];
  const hue = CARD_HUES[index % CARD_HUES.length];
  const accent = authorAccent ?? `oklch(90% 0.06 ${hue})`;
  const seed = index * 71 + 19;
  const R = 20;
  const mag = Math.min(w, h) * 0.025;

  const cardInterior = `oklch(97.5% 0.012 ${hue})`;
  const cardHovered = `oklch(92.5% 0.024 ${hue})`;
  const dividerPath = useMemo(() => wavyLine(200, seed + 17, 1.4, 7), [seed]);

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [4, 5],
      curve: 0.6,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, seed, mag]);

  const mobileBleed = 'clamp(24px, 5vw, 80px)';

  return (
    <article
      ref={cardRef}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={styles.card}
      style={{
        padding: isMobile ? `28px calc(18px + ${mobileBleed})` : '18px',
        marginLeft: isMobile ? `calc(-1 * ${mobileBleed})` : 0,
        marginRight: isMobile ? `calc(-1 * ${mobileBleed})` : 0,
        background: isMobile ? cardInterior : 'transparent',
      }}
    >
      {isMobile ? (
        <>
          <GrainOverlay opacity={0.08} />
          <svg
            viewBox="0 0 200 6"
            preserveAspectRatio="none"
            aria-hidden="true"
            className={styles.mobileDivider}
            style={{ top: -3 }}
          >
            <path d={dividerPath} transform="translate(0,3)" stroke={bc1} strokeWidth="1.4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
          {isLast && (
            <svg
              viewBox="0 0 200 6"
              preserveAspectRatio="none"
              aria-hidden="true"
              className={styles.mobileDivider}
              style={{ bottom: -3 }}
            >
              <path d={dividerPath} transform="translate(0,3)" stroke={bc1} strokeWidth="1.4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </>
      ) : (
        <>
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed} mag={mag}
            fillColor={cardInterior}
            strokeColor="transparent"
            strokeWidth={0}
            chalkSeed={index}
            segmentsH={[3, 4]} segmentsV={[4, 5]}
            curve={0.6} cornerJitter={0.7} cornerOffset={4}
          />
          {w > 0 && h > 0 && (
            <svg
              aria-hidden="true"
              width={w} height={h}
              viewBox={`0 0 ${w} ${h}`}
              style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 0 }}
            >
              <defs>
                <mask
                  id={`brush-${maskId}`}
                  maskUnits="userSpaceOnUse"
                  x={-w} y={-h} width={w * 3} height={h * 3}
                >
                  <circle
                    cx={pos.x} cy={pos.y}
                    r={hovered ? maxR : 0}
                    fill="white"
                    style={{ transition: 'r 460ms linear' }}
                  />
                </mask>
              </defs>
              <g mask={`url(#brush-${maskId})`}>
                <path d={borderPath} fill={cardHovered} />
              </g>
            </svg>
          )}
          <ShapeGrain w={w} h={h} d={borderPath} opacity={0.3} frequency={0.85} seed={seed} />
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed} mag={mag}
            strokeColor={bc1}
            strokeWidth={INK}
            segmentsH={[3, 4]} segmentsV={[4, 5]}
            curve={0.6} cornerJitter={0.7} cornerOffset={4}
          />
        </>
      )}

      <div className={styles.content}>
        <OrganicImage
          src={imageUrl}
          alt={imageLabel ?? title}
          seed={seed + 5}
          ratio={0.56}
          className={styles.imagePlaceholder}
        >
          {!imageUrl && (
            <div className={styles.imageFallback} style={{ background: accent }} aria-hidden />
          )}
          <GrainOverlay opacity={0.055} />
        </OrganicImage>

        <h3 className={styles.title}>{title}</h3>

        <div className={styles.authorRow}>
          <HandDrawnAvatar
            initials={authorInitials}
            size={30}
            color={accent}
            seed={authorSeed ?? authorInitials.charCodeAt(0) * 13}
          />
          <span className={styles.authorName}>{author}</span>
        </div>
      </div>
    </article>
  );
}
