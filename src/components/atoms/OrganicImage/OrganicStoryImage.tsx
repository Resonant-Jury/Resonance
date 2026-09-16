'use client';

import { useMemo, useRef } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { INK_STRONG } from '@/lib/design/strokes';
import { useElementSize } from '@/lib/hooks/useElementSize';

export interface OrganicStoryImageProps {
  src: string;
  alt?: string;
  /** Seed for the wobbly clip so the curve is stable across SSR/CSR. */
  seed?: number;
  /** Draw a hand-drawn stroke along the curved edge (editor selection frame). */
  framed?: boolean;
  draggable?: boolean;
  /** Class on the outer box — lets the host own the image's place in the flow. */
  className?: string;
}

/**
 * A story-body image shown at its natural size, clipped by the same hand-drawn
 * wobbly curve as the cover image. Unlike `OrganicImage` it never forces a
 * ratio — the curve hugs whatever box the photo lays out. Rendered entirely
 * with `<span>`s so it stays valid inside a markdown paragraph.
 *
 * Natural size within two limits: the column's width, and
 * `--story-image-max-h`. The height cap is what a portrait photo needs — at
 * full width a tall shot is several screens high, so the reader scrolls
 * through a wall of picture and loses the thread of the story. Capped, it
 * stays a picture *in* an article.
 */
export function OrganicStoryImage({
  src,
  alt = '',
  seed = 7,
  framed = false,
  draggable,
  className,
}: OrganicStoryImageProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { w, h } = useElementSize(ref);

  const mag = Math.min(w, h) * 0.025;
  // The wobble swings both inward and outward of the box edge, so the photo
  // is zoomed just enough that the outward bulges land on real pixels instead
  // of being clipped to nothing.
  const cornerOffset = 6;
  const bleed = Math.ceil(mag + cornerOffset + 4);

  const clip = useMemo(() => {
    if (!w || !h) return undefined;
    return wobRect(w, h, 12, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [2, 3],
      curve: 0.4,
      cornerJitter: 1.1,
      cornerOffset,
    });
  }, [w, h, seed, mag]);

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'block',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      <span
        ref={ref}
        style={{
          display: 'block',
          lineHeight: 0,
          maxWidth: '100%',
          clipPath: clip ? `path('${clip}')` : undefined,
        }}
      >
        {/* Plain <img>: the clip + slight zoom mask it organically; next/image's
            wrapper/sizing fights that layout. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={draggable}
          style={{
            display: 'block',
            width: 'auto',
            height: 'auto',
            maxWidth: '100%',
            maxHeight: 'var(--story-image-max-h)',
            transform: clip ? `scale(${(w + bleed * 2) / w}, ${(h + bleed * 2) / h})` : undefined,
          }}
        />
      </span>
      {framed && clip && (
        <svg
          aria-hidden
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
        >
          <path
            d={clip}
            fill="none"
            stroke="var(--color-terracotta)"
            strokeWidth={INK_STRONG}
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}
