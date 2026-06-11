'use client';

import { useRef } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { OrganicImage } from '@/components/atoms/OrganicImage/OrganicImage';
import { GrainOverlay } from '@/components/atoms/GrainOverlay/GrainOverlay';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK } from '@/lib/design/strokes';
import styles from './EmbedStoryCard.module.css';

export interface EmbedStoryCardProps {
  title: string;
  author?: string;
  imageUrl?: string;
  /** Accent hue (the card's `accentHue`); drives interior tint + fallback thumb. */
  hue?: number;
  seed?: number;
  /** Editor focus state: border switches to the focus terracotta. */
  selected?: boolean;
}

/**
 * The smallest member of the story-card family — a horizontal chip embedded
 * inside an article body: thumbnail on the left, title above author on the
 * right. Used both by the published article (wrapped in a Link) and by the
 * editor's card node view. Chrome is the same hand-drawn wobble as its bigger
 * siblings, with size-adaptive wobble (no hardcoded segments).
 */
export function EmbedStoryCard({
  title,
  author,
  imageUrl,
  hue = 55,
  seed = 19,
  selected = false,
}: EmbedStoryCardProps) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref);

  const interior = `oklch(97.5% 0.012 ${hue})`;
  const accent = `oklch(90% 0.06 ${hue})`;
  const border = selected ? 'var(--field-border-focus)' : `oklch(52% 0.11 ${hue})`;

  return (
    <article ref={ref} className={styles.card}>
      <HandDrawnBorder
        w={w}
        h={h}
        R={16}
        seed={seed}
        fillColor={interior}
        strokeColor={border}
        strokeWidth={INK}
        chalkSeed={seed + 1}
      />
      <span className={styles.thumb}>
        <OrganicImage src={imageUrl} alt="" seed={seed + 5} ratio={1}>
          {!imageUrl && <span className={styles.thumbFallback} style={{ background: accent }} aria-hidden />}
          <GrainOverlay opacity={0.055} />
        </OrganicImage>
      </span>
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {author && <span className={styles.author}>{author}</span>}
      </span>
    </article>
  );
}
