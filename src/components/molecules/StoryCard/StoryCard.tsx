'use client';

import { CSSProperties, MouseEvent, useId, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { INK, INK_LIGHT } from '@/lib/design/strokes';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { Icon } from '@/components/atoms/Icon';
import { Skeleton } from '@/components/atoms/Skeleton/Skeleton';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wobRect } from '@/lib/design/wobRect';
import { wavyLine } from '@/lib/design/wavyPath';
import { CARD_HUES, cardHueIndex, nearestCardHue } from '@/lib/design/dominantHue';
import styles from './StoryCard.module.css';

export interface Story {
  title: string;
  excerpt: string;
  author: string;
  authorInitials: string;
  avatarUrl?: string;
  avatarSeed?: string;
  readTime: string;
  tags: string[];
  imageUrl?: string;
  imageLabel?: string;
  /** Cover-image dominant hue snapped to the card palette (see lib/design/dominantHue). */
  accentHue?: number;
}

const CARD_FILLS = [
  'oklch(90% 0.065 55)',
  'oklch(94% 0.032 290)',
  'oklch(93% 0.042 140)',
  'oklch(92% 0.075 88)',
  'oklch(92% 0.033 215)',
  'oklch(89% 0.047 18)',
];

const CARD_BORDERS = [
  ['oklch(52% 0.13 55)',  'oklch(38% 0.11 55)'],
  ['oklch(54% 0.10 290)', 'oklch(42% 0.09 290)'],
  ['oklch(50% 0.12 140)', 'oklch(38% 0.11 140)'],
  ['oklch(58% 0.14 88)',  'oklch(44% 0.12 88)'],
  ['oklch(50% 0.10 215)', 'oklch(38% 0.09 215)'],
  ['oklch(52% 0.09 18)',  'oklch(40% 0.08 18)'],
];

// Canonical hue list lives in lib/design/dominantHue (shared with the
// cover-image dominant-colour extraction); re-exported for existing consumers.
export { CARD_HUES };

function StoryImage({ label, accentFill, imageUrl, seed }: { label: string; accentFill: string; imageUrl?: string; seed: number }) {
  const stripeFill = accentFill.replace(/(\d+)%/, (_, n) => `${Math.max(0, +n - 7)}%`);
  return (
    <OrganicImage
      src={imageUrl}
      alt={label}
      seed={seed}
      ratio={0.62}
      className={styles.imagePlaceholder}
    >
      {!imageUrl && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          viewBox="0 0 320 200"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <rect width="320" height="200" fill={accentFill} />
          {Array.from({ length: 22 }, (_, i) => (
            <line
              key={i}
              x1={i * 22 - 160}
              y1="0"
              x2={i * 22 + 160}
              y2="200"
              stroke={stripeFill}
              strokeWidth={INK_LIGHT}
              strokeOpacity="0.28"
            />
          ))}
          <text
            x="50%"
            y="52%"
            textAnchor="middle"
            dominantBaseline="middle"
            fontFamily="monospace"
            fontSize="10.5"
            fill="oklch(28% 0.04 60)"
            fillOpacity="0.42"
          >
            {label}
          </text>
        </svg>
      )}
      <GrainOverlay opacity={0.055} />
    </OrganicImage>
  );
}

/** Wavy section dividers framing a full-bleed mobile card: one along the top
    edge, plus one along the bottom for the last card of the feed. */
function MobileDividers({ d, stroke, isLast }: { d: string; stroke: string; isLast: boolean }) {
  const edge = (pos: 'top' | 'bottom') => (
    <svg
      viewBox="0 0 200 6"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={styles.mobileDivider}
      style={pos === 'top' ? { top: -3 } : { bottom: -3 }}
    >
      <path
        d={d}
        transform="translate(0,3)"
        stroke={stroke}
        strokeWidth={INK_LIGHT}
        fill="none"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
  return (
    <>
      {edge('top')}
      {isLast && edge('bottom')}
    </>
  );
}

export interface StoryCardProps {
  story?: Story;
  index?: number;
  isLast?: boolean;
  /** Render the real card chrome (border, fills, colours) but swap text/image/icons for grey blocks. */
  loading?: boolean;
  /**
   * System annotation (e.g. the recommender's「因為…」line) rendered at the
   * very bottom of the card, after the byline, in the handwritten font — a
   * scribbled margin note from Resonance, unmistakably not the author's story.
   */
  quote?: string;
}

export function StoryCard({ story, index = 0, isLast = false, loading = false, quote }: StoryCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(cardRef, 340, 480);
  const isMobile = useIsMobile();
  const maskId = useId().replace(/:/g, '');

  const recordPointer = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPos({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const maxR = Math.hypot(Math.max(pos.x, w - pos.x), Math.max(pos.y, h - pos.y)) + 6;

  // Palette family: the cover image's dominant hue when known (snapped to the
  // designed families), otherwise the legacy position-based rotation.
  const hueIdx = story?.accentHue != null ? cardHueIndex(nearestCardHue(story.accentHue)) : -1;
  const paletteIdx = hueIdx >= 0 ? hueIdx : index % CARD_FILLS.length;
  const accentFill = CARD_FILLS[paletteIdx];
  const [bc1] = CARD_BORDERS[paletteIdx];
  const hue = CARD_HUES[paletteIdx];
  const seed = index * 77 + 13;
  const R = 22;
  const mag = Math.min(w, h) * 0.025;

  const cardInterior = `oklch(97.5% 0.012 ${hue})`;
  const cardHovered = `oklch(92.5% 0.024 ${hue})`;

  const dividerPath = useMemo(() => wavyLine(200, seed + 17, 1.4, 7), [seed]);
  const separatorPath = useMemo(() => wavyLine(200, seed + 91, 1.2, 6), [seed]);

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [5, 6],
      curve: 0.55,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, R, seed, mag]);

  return (
    <article
      ref={cardRef}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={styles.card}
      style={{
        // Mobile-vs-desktop layout lives in the module CSS (640px media
        // query); the card only supplies its palette as variables.
        '--card-interior': cardInterior,
        // Tint every placeholder shimmer inside with this card's own hue
        // (a lighter shade of the card family), overriding the theme accent.
        '--skeleton-highlight': `oklch(88% 0.08 ${hue})`,
      } as CSSProperties}
    >
      {loading ? (
        // Both chromes render; the module CSS shows exactly one per viewport,
        // so even the pre-hydration SSR paint matches the loaded design.
        <>
          <div className={styles.skeletonChrome} aria-hidden style={{ background: cardInterior }} />
          <div className={styles.skeletonMobileChrome} aria-hidden>
            <GrainOverlay opacity={0.08} />
            <MobileDividers d={dividerPath} stroke={bc1} isLast={isLast} />
          </div>
        </>
      ) : isMobile ? (
        <>
          <GrainOverlay opacity={0.08} />
          <MobileDividers d={dividerPath} stroke={bc1} isLast={isLast} />
        </>
      ) : (
        <>
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed} mag={mag}
            fillColor={cardInterior}
            strokeColor="transparent"
            strokeWidth={0}
            chalkSeed={index}
            segmentsH={[3, 4]} segmentsV={[5, 6]}
            curve={0.55} cornerJitter={0.7} cornerOffset={4}
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
            segmentsH={[3, 4]} segmentsV={[5, 6]}
            curve={0.55} cornerJitter={0.7} cornerOffset={4}
          />
        </>
      )}

      <div className={styles.content}>
        {loading ? (
          <div className={styles.imagePlaceholder}>
            {/* Radius mirrors OrganicImage's pre-wobble R so the placeholder
                sits where the hand-drawn image curve will land. */}
            <Skeleton height="100%" radius={18} style={{ position: 'absolute', inset: 0 }} />
          </div>
        ) : (
          <StoryImage
            label={story!.imageLabel || 'story illustration'}
            accentFill={accentFill}
            imageUrl={story!.imageUrl}
            seed={seed + 5}
          />
        )}

        <div className={styles.tagRow}>
          {loading ? (
            <>
              <Skeleton width={56} height={22} radius={11} />
              <Skeleton width={72} height={22} radius={11} />
            </>
          ) : (
            story!.tags?.slice(0, 4).map(t => (
              <TagPill key={t} color={accentFill}>{t}</TagPill>
            ))
          )}
        </div>

        {loading ? (
          <div className={styles.title}>
            <Skeleton height={18} width="90%" />
            <Skeleton height={18} width="55%" style={{ marginTop: 8 }} />
          </div>
        ) : (
          <h3 className={styles.title}>{story!.title}</h3>
        )}

        {loading ? (
          <div className={styles.excerpt} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height={13} />
            <Skeleton height={13} />
            <Skeleton height={13} width="70%" />
          </div>
        ) : (
          <p className={styles.excerpt}>{story!.excerpt}</p>
        )}

        <svg
          viewBox="0 0 200 6"
          preserveAspectRatio="none"
          aria-hidden="true"
          className={styles.separator}
        >
          <path
            d={separatorPath}
            transform="translate(0, 3)"
            stroke={`oklch(55% 0.04 ${hue} / 0.4)`}
            strokeWidth={INK_LIGHT}
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        <div className={styles.authorRow}>
          {loading ? (
            <Skeleton width={30} height={30} circle />
          ) : (
            <HandDrawnAvatar
              src={story!.avatarUrl}
              initials={story!.authorInitials}
              size={30}
              color={accentFill}
              seed={Number(story!.avatarSeed) || story!.authorInitials.charCodeAt(0) * 13}
            />
          )}
          <div style={{ flex: 1 }}>
            {loading ? (
              <>
                <Skeleton width={96} height={13} />
                <Skeleton width={56} height={11} style={{ marginTop: 6 }} />
              </>
            ) : (
              <>
                <div className={styles.authorName}>{story!.author}</div>
                <div className={styles.readTime}>{story!.readTime}</div>
              </>
            )}
          </div>
          {loading ? (
            <Skeleton width={18} height={18} circle />
          ) : (
            <Icon
              name="arrow-right"
              size={18}
              strokeWidth={INK}
              style={{ opacity: hovered ? 0.7 : 0.28, transition: 'opacity 180ms' }}
            />
          )}
        </div>

        {!loading && quote && (
          <aside className={styles.systemNote} style={{ color: `oklch(44% 0.08 ${hue})` }}>
            <Icon
              name="sparkle"
              size={13}
              strokeWidth={INK_LIGHT}
              style={{ flexShrink: 0, marginTop: 5 }}
            />
            <span>{quote}</span>
          </aside>
        )}
      </div>
    </article>
  );
}
