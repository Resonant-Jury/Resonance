'use client';

import { useId, useMemo } from 'react';
import { wobRect } from '@/lib/design/wobRect';
import { HandDrawnBorder } from '../HandDrawnBorder/HandDrawnBorder';
import { INK } from '@/lib/design/strokes';

export interface HandDrawnAvatarProps {
  initials?: string;
  /** uploaded avatar image URL; when set, the picture fills the wobbly shape */
  src?: string;
  size?: number;
  color?: string;
  seed?: number;
}

// Geometry shared between the initials border and the image clip so the picture
// fills exactly the same hand-drawn outline.
const AVATAR_WOB = {
  segmentsH: 1 as const,
  segmentsV: 1 as const,
  curve: 1.3,
  cornerJitter: 3.2,
};

/**
 * The exact wobbly outline of an avatar at a given size/seed. Exported so other
 * UI (e.g. a hover wash overlay) can clip itself to the same hand-drawn curve
 * instead of approximating it with border-radius.
 */
export function avatarWobPath(size: number, seed = 1): string {
  return wobRect(size, size, size * 0.4, seed, size * 0.022, {
    ...AVATAR_WOB,
    cornerOffset: size * 0.06,
  });
}

export function HandDrawnAvatar({
  initials = '?',
  src,
  size = 36,
  color = 'var(--color-terracotta-light)',
  seed = 1,
}: HandDrawnAvatarProps) {
  const uid = useId().replace(/:/g, '');
  const R = size * 0.4;
  const mag = size * 0.022;
  const cornerOffset = size * 0.06;

  const path = useMemo(
    () => (src ? avatarWobPath(size, seed) : ''),
    [src, size, seed]
  );

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {src ? (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="res-shape-fade-in"
          role="img"
          aria-label={initials}
          style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
        >
          <defs>
            <clipPath id={`hdavatar-${uid}`}>
              <path d={path} />
            </clipPath>
          </defs>
          <image
            href={src}
            x={0}
            y={0}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#hdavatar-${uid})`}
          />
          <path
            d={path}
            fill="none"
            stroke="oklch(36% 0.06 60 / 0.55)"
            strokeWidth={INK}
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <>
          <HandDrawnBorder
            w={size}
            h={size}
            R={R}
            seed={seed}
            mag={mag}
            fillColor={color}
            strokeColor="oklch(36% 0.06 60 / 0.55)"
            strokeWidth={INK}
            segmentsH={1}
            segmentsV={1}
            curve={1.3}
            cornerJitter={3.2}
            cornerOffset={cornerOffset}
          />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: size * 0.35,
              color: 'var(--color-text)',
              userSelect: 'none',
            }}
          >
            {initials}
          </span>
        </>
      )}
    </div>
  );
}
