'use client';

import { useRef } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { useElementSize } from '@/lib/hooks/useElementSize';

export interface CardQuoteProps {
  text: string;
  hue: number;
}

/**
 * The thought-core, set as an organic hand-drawn quote block. Matches the
 * StoryCard aesthetic: wobbly border + warm chalk fill, instead of the plain
 * CSS rounded rectangle used elsewhere.
 */
export function CardQuote({ text, hue }: CardQuoteProps) {
  const ref = useRef<HTMLElement>(null);
  const { w, h } = useElementSize(ref, 700, 220);
  const seed = 41;
  const R = 26;

  return (
    <figure
      ref={ref}
      style={{
        position: 'relative',
        margin: '0 0 36px',
        padding: 'clamp(34px, 5vw, 48px) clamp(26px, 4vw, 42px) clamp(30px, 4vw, 40px)',
      }}
    >
      <HandDrawnBorder
        w={w}
        h={h}
        R={R}
        seed={seed}
        fillColor={`oklch(95% 0.045 ${hue} / 0.66)`}
        strokeColor={`oklch(62% 0.11 ${hue} / 0.42)`}
        strokeWidth={2}
        chalkSeed={7}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 'clamp(-8px, -0.5vw, -2px)',
          left: 'clamp(16px, 3vw, 28px)',
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(56px, 8vw, 84px)',
          color: `oklch(58% 0.12 ${hue} / 0.3)`,
          lineHeight: 1,
          pointerEvents: 'none',
        }}
      >
        “
      </span>
      <blockquote
        style={{
          position: 'relative',
          margin: 0,
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(24px, 3.4vw, 34px)',
          fontWeight: 700,
          lineHeight: 1.4,
          color: 'var(--color-text)',
          letterSpacing: '-0.01em',
        }}
      >
        {text}
      </blockquote>
    </figure>
  );
}
