'use client';

import { useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { BrushWash } from '@/components/atoms/BrushWash/BrushWash';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { seedFromString } from '@/lib/design/prng';
import { autoCurve, autoMag, autoSegments } from '@/lib/design/wobAuto';
import { wobRect } from '@/lib/design/wobRect';
import { useElementSize } from '@/lib/hooks/useElementSize';
import styles from './StoryLinkCard.module.css';

const R = 16;
/**
 * How far what runs edge to edge (a picture, a cover, a band) reaches past
 * the block's box once the outline cuts it (`--picture-bleed`), so the
 * outline's outward swings (a few px at most) still land on it.
 */
const BLEED = 8;
/** The block's fill (the chat's card bubble's) and its hover wash. No pen line: the fill is its edge. */
const FILL = 'var(--bubble-theirs)';
const WASH = 'var(--bubble-quote)';

export interface StoryBlock<T extends HTMLElement> {
  ref: RefObject<T | null>;
  /** The measured outline in the block's own box — what cuts its edge-to-edge content — or null until measured. */
  d: string | null;
  /** For the block's root: its class, the stand-in's look until measured, the hover's pointer. */
  rootProps: {
    className: string;
    'data-shape-pending'?: '';
    style: CSSProperties;
    onMouseEnter: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: (e: MouseEvent<HTMLElement>) => void;
  };
  /** The fill and the hover wash: the root's first children, under its content. */
  layers: ReactNode;
}

/**
 * The container a block standing alone in a story wears — a web link's card
 * (StoryLinkCard) and an embedded Resonance card (CardEmbedLink): a block of
 * light fill in a wobbly outline seeded by its address (R 16, the size's own
 * wobble), no pen line, the story column's width at most, and a wash that
 * grows from the pointer under hover. Until measured (the server's HTML) it
 * is a plain rounded block of the same fill (`res-shape-stand-in`).
 */
export function useStoryBlock<T extends HTMLElement>(seedKey: string): StoryBlock<T> {
  const ref = useRef<T>(null);
  const { w, h } = useElementSize(ref);
  const [hovered, setHovered] = useState(false);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const seed = seedFromString(seedKey);

  // The block's outline, measured: the fill, the hover wash and the clip of what runs edge to edge all follow this one path.
  const shape = useMemo(() => {
    if (!w || !h) return null;
    const outline = { mag: autoMag(w, h), curve: autoCurve(w, h), segmentsH: autoSegments(w), segmentsV: autoSegments(h) };
    return { outline, d: wobRect(w, h, R, seed, outline.mag, outline) };
  }, [w, h, seed]);

  const track = (e: MouseEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return {
    ref,
    d: shape?.d ?? null,
    rootProps: {
      className: `${styles.card} res-shape-stand-in`,
      // A plain rounded block of the same fill until measured (the server's HTML).
      'data-shape-pending': shape ? undefined : '',
      style: {
        '--shape-fill': FILL,
        '--shape-radius': `${R}px`,
        '--picture-bleed': `${BLEED}px`,
      } as CSSProperties,
      onMouseEnter: (e) => {
        track(e);
        setHovered(true);
      },
      onMouseLeave: (e) => {
        track(e);
        setHovered(false);
      },
    },
    layers: shape && (
      <>
        <HandDrawnBorder w={w} h={h} R={R} seed={seed} fillColor={FILL} chalkSeed={seed + 1} {...shape.outline} />
        <BrushWash w={w} h={h} d={shape.d} color={WASH} x={pointer.x} y={pointer.y} on={hovered} duration={460} />
      </>
    ),
  };
}
