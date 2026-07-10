'use client';

import { useId, useMemo, useRef } from 'react';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { Icon } from '../Icon/Icon';
import { wobRect } from '@/lib/design/wobRect';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { useElementSize } from '@/lib/hooks/useElementSize';
import { INK } from '@/lib/design/strokes';
import styles from './HandDrawnImage.module.css';

/** How far the image extends past the box on every side. Must cover the
 *  wobble's outward swing (autoMag caps at 4px) plus half the ink stroke. */
const BLEED = 6;

export interface HandDrawnImageProps {
  src: string;
  alt?: string;
  seed?: number;
  R?: number;
  curve?: number;
  /** Show a hand-drawn close button (top-right) wired to this handler. */
  onRemove?: () => void;
  removeLabel?: string;
}

/**
 * An <img> clipped to a wobbly hand-drawn rectangle so the picture fully fills
 * the organic shape while the drawn outline stays visible on top. Mirrors the
 * geometry of HandDrawnDashedSurface so it reads as the same frame.
 */
export function HandDrawnImage({
  src,
  alt = '',
  seed = 31,
  R = 16,
  curve,
  onRemove,
  removeLabel,
}: HandDrawnImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 480, 300);
  const uid = useId().replace(/:/g, '');

  const path = useMemo(() => {
    if (!w || !h) return '';
    return wobRect(w, h, R, seed, autoMag(w, h), {
      segmentsH: autoSegments(w),
      segmentsV: autoSegments(h),
      curve: curve != null ? curve : autoCurve(w, h),
    });
  }, [w, h, R, seed, curve]);

  return (
    <div ref={ref} className={styles.wrap}>
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className={styles.svg}
          role="img"
          aria-label={alt}
        >
          <defs>
            <clipPath id={`hdimg-${uid}`}>
              <path d={path} />
            </clipPath>
          </defs>
          {/* Overscan past the box so the wobble's outward bulges land on
              image pixels instead of leaving a sliver of background between
              the picture and the drawn outline (same trick as OrganicImage). */}
          <image
            href={src}
            x={-BLEED}
            y={-BLEED}
            width={w + BLEED * 2}
            height={h + BLEED * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#hdimg-${uid})`}
          />
          <path
            d={path}
            fill="none"
            stroke="var(--field-border)"
            strokeWidth={INK}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}

      {onRemove && (
        <button
          type="button"
          className={styles.removeBtn}
          onClick={onRemove}
          aria-label={removeLabel}
        >
          <HandDrawnBorder
            w={34}
            h={34}
            R={34 * 0.4}
            seed={seed + 5}
            mag={34 * 0.022}
            fillColor="oklch(30% 0.02 70 / 0.7)"
            strokeColor="oklch(96% 0.02 75 / 0.75)"
            strokeWidth={INK}
            segmentsH={1}
            segmentsV={1}
            curve={1.3}
            cornerJitter={3.2}
            cornerOffset={34 * 0.06}
          />
          <Icon name="close" size={16} color="var(--color-cream)" />
        </button>
      )}
    </div>
  );
}
