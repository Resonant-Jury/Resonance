'use client';

import { CSSProperties, ReactNode, useMemo, useRef } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';

export interface OrganicImageProps {
  /** Image to render, cover-fitted inside the organic clip. */
  src?: string;
  alt?: string;
  /** Seed for the wobbly clip path so the curve is stable across SSR/CSR. */
  seed?: number;
  /** Corner radius before wobble. */
  R?: number;
  /** Height of the padding-box as a ratio of width (e.g. 0.62 → 62%). */
  ratio?: number;
  className?: string;
  style?: CSSProperties;
  /** Overlays or fallback content rendered inside the clipped box. */
  children?: ReactNode;
}

/**
 * Wraps an image (or fallback content) in a hand-drawn, curvy clip so the edges
 * read as organic rather than a flat rounded rectangle. The clip is generated
 * with `wobRect` and applied via CSS `clip-path: path()` once the box has been
 * measured — anything rendered inside (the image, a grain overlay, a fallback
 * SVG) is masked to the same curve.
 */
export function OrganicImage({
  src,
  alt = '',
  seed = 7,
  R = 18,
  ratio = 0.62,
  className,
  style,
  children,
}: OrganicImageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(ref, 320, Math.round(320 * ratio));

  const mag = Math.min(w, h) * 0.05;
  // The wobble pushes the path both inward and outward of the box edge. The
  // content must extend past the box by at least the outward swing (plus the
  // corner offset) so the bulges always sit on real image pixels instead of
  // being clipped to nothing — otherwise only the concave dips would read.
  const cornerOffset = 6;
  const bleed = Math.ceil(mag + cornerOffset + 4);

  const clip = useMemo(() => {
    if (!w || !h) return undefined;
    return wobRect(w, h, R, seed, mag, {
      segmentsH: [3, 4],
      segmentsV: [2, 3],
      curve: 0.4,
      cornerJitter: 1.1,
      cornerOffset,
    });
  }, [w, h, R, seed, mag]);

  return (
    <div
      ref={ref}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        paddingBottom: `${ratio * 100}%`,
        clipPath: clip ? `path('${clip}')` : undefined,
        ...style,
      }}
    >
      {/* Content bleeds past the box by `bleed` px so the clip's outward bulges
          land on image pixels rather than on empty space. */}
      <div style={{ position: 'absolute', inset: clip ? -bleed : 0 }}>
        {src && (
          <img
            src={src}
            alt={alt}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
