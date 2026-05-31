'use client';

import { MouseEvent, useId, useMemo, useRef, useState } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { ShapeGrain } from '@/components/atoms/ShapeGrain/ShapeGrain';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { TagPill } from '@/components/atoms/TagPill/TagPill';
import { HandDrawnAvatar } from '@/components/atoms/HandDrawnAvatar/HandDrawnAvatar';
import { Icon } from '@/components/atoms/Icon';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { wobRect } from '@/lib/design/wobRect';
import { wavyLine } from '@/lib/design/wavyPath';
import styles from './StoryCard.module.css';

export interface Story {
  title: string;
  excerpt: string;
  author: string;
  authorInitials: string;
  readTime: string;
  tags: string[];
  imageUrl?: string;
  imageLabel?: string;
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

const CARD_HUES = [55, 290, 140, 88, 215, 18];

function StoryImage({ label, accentFill, imageUrl }: { label: string; accentFill: string; imageUrl?: string }) {
  const stripeFill = accentFill.replace(/(\d+)%/, (_, n) => `${Math.max(0, +n - 7)}%`);
  return (
    <div className={styles.imagePlaceholder}>
      {imageUrl ? (
        <img src={imageUrl} alt={label} className={styles.storyImage} />
      ) : (
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
              strokeWidth="1.5"
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
    </div>
  );
}

export interface StoryCardProps {
  story: Story;
  index?: number;
  isLast?: boolean;
}

export function StoryCard({ story, index = 0, isLast = false }: StoryCardProps) {
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

  const accentFill = CARD_FILLS[index % CARD_FILLS.length];
  const [bc1] = CARD_BORDERS[index % CARD_BORDERS.length];
  const hue = CARD_HUES[index % CARD_HUES.length];
  const seed = index * 77 + 13;
  const R = 22;

  const cardInterior = `oklch(97.5% 0.012 ${hue})`;
  const cardHovered = `oklch(92.5% 0.024 ${hue})`;

  const dividerPath = useMemo(() => wavyLine(200, seed + 17, 1.4, 7), [seed]);
  const separatorPath = useMemo(() => wavyLine(200, seed + 91, 1.2, 6), [seed]);

  const borderPath = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, Math.min(w, h) * 0.025, {
      segmentsH: [3, 4],
      segmentsV: [5, 6],
      curve: 0.55,
      cornerJitter: 0.7,
      cornerOffset: 4,
    });
  }, [w, h, R, seed]);

  const mobileBleed = 'clamp(24px, 5vw, 80px)';

  return (
    <article
      ref={cardRef}
      onMouseEnter={(e) => { recordPointer(e); setHovered(true); }}
      onMouseLeave={(e) => { recordPointer(e); setHovered(false); }}
      className={styles.card}
      style={{
        padding: isMobile ? `32px calc(18px + ${mobileBleed})` : '22px',
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
            <path
              d={dividerPath}
              transform="translate(0,3)"
              stroke={bc1}
              strokeWidth="1.4"
              fill="none"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {isLast && (
            <svg
              viewBox="0 0 200 6"
              preserveAspectRatio="none"
              aria-hidden="true"
              className={styles.mobileDivider}
              style={{ bottom: -3 }}
            >
              <path
                d={dividerPath}
                transform="translate(0,3)"
                stroke={bc1}
                strokeWidth="1.4"
                fill="none"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
        </>
      ) : (
        <>
          <HandDrawnBorder
            w={w} h={h} R={R} seed={seed}
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
            w={w} h={h} R={R} seed={seed}
            strokeColor={bc1}
            segmentsH={[3, 4]} segmentsV={[5, 6]}
            curve={0.55} cornerJitter={0.7} cornerOffset={4}
          />
        </>
      )}

      <div className={styles.content}>
        <StoryImage 
          label={story.imageLabel || 'story illustration'} 
          accentFill={accentFill} 
          imageUrl={story.imageUrl}
        />

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {story.tags?.slice(0, 4).map(t => (
            <TagPill key={t} color={accentFill}>{t}</TagPill>
          ))}
        </div>

        <h3 className={styles.title}>{story.title}</h3>
        <p className={styles.excerpt}>{story.excerpt}</p>

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
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        <div className={styles.authorRow}>
          <HandDrawnAvatar
            initials={story.authorInitials}
            size={30}
            color={accentFill}
            seed={story.authorInitials.charCodeAt(0) * 13}
          />
          <div style={{ flex: 1 }}>
            <div className={styles.authorName}>{story.author}</div>
            <div className={styles.readTime}>{story.readTime}</div>
          </div>
          <Icon
            name="arrow-right"
            size={18}
            strokeWidth={1.7}
            style={{ opacity: hovered ? 0.7 : 0.28, transition: 'opacity 180ms' }}
          />
        </div>
      </div>
    </article>
  );
}
