'use client';

import { useMemo } from 'react';
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

/** A character drawn a full em wide: CJK ideographs, kana, hangul, fullwidth forms. */
function isWide(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    cp >= 0x20000
  );
}

/**
 * The initials' type size as a share of the avatar: 0.35, unless the letters would run wider
 * than 0.56 of it (a wide character counted as an em, any other as 0.62) — two Chinese
 * characters at 0.35 met the outline's curve with no paper beside them. The apps' twins
 * (Android HandDrawnAvatar, iOS HandDrawnAvatar) follow the same rule.
 */
export function initialsScale(initials: string): number {
  let ems = 0;
  for (const ch of initials) ems += isWide(ch.codePointAt(0)!) ? 1 : 0.62;
  return ems > 0 ? Math.min(0.35, 0.56 / ems) : 0.35;
}

export function HandDrawnAvatar({
  initials = '?',
  src,
  size = 36,
  color = 'var(--color-terracotta-light)',
  seed = 1,
}: HandDrawnAvatarProps) {
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
        // The picture is a plain <img> clipped to the outline (an SVG <image>
        // can't load lazily, and avatars sit on every card of a feed), with
        // the drawn outline on top.
        <span className="res-shape-fade-in" style={{ position: 'absolute', inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={initials}
            width={size}
            height={size}
            loading="lazy"
            decoding="async"
            style={{
              position: 'absolute',
              inset: 0,
              width: size,
              height: size,
              objectFit: 'cover',
              clipPath: `path('${path}')`,
            }}
          />
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
          >
            <path
              d={path}
              fill="none"
              stroke="oklch(36% 0.06 60 / 0.55)"
              strokeWidth={INK}
              strokeLinejoin="round"
            />
          </svg>
        </span>
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
              fontSize: size * initialsScale(initials),
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
