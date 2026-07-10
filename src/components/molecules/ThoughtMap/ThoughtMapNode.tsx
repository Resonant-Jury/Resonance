'use client';

import { memo, useId, useMemo, type PointerEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import { seedFromString } from '@/lib/design/prng';
import { wobRect } from '@/lib/design/wobRect';
import { plainExcerpt } from '@/lib/adapters/story';
import type { Card, Visibility } from '@/lib/db/types';
import { NODE_H, NODE_W } from './mapMath';
import styles from './ThoughtMap.module.css';

const NODE_HUES = [55, 290, 140, 88, 215, 18];

const VISIBILITY_ICON: Record<Visibility, 'globe' | 'users' | 'lock'> = {
  public: 'globe',
  connections: 'users',
  private: 'lock',
};

export function nodeHue(card: Card): number {
  return card.accentHue ?? NODE_HUES[seedFromString(card.id) % NODE_HUES.length];
}

export interface ThoughtMapNodeProps {
  card: Card;
  x: number;
  y: number;
  selected: boolean;
  /** Highlight as the prospective target while an arrow is being drawn. */
  linkTarget: boolean;
  /** True while this node is being dragged — hides the action tab mid-drag. */
  dragging?: boolean;
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onStartLink: (e: PointerEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  onRemove: () => void;
  linkHandleLabel: string;
  openLabel: string;
  removeLabel: string;
}

/* The selected card's action tab: a small chip that grows out of the card's
   top edge. Only its left/top/right sides are stroked — the fill runs down
   over the card's own top border so the two read as one surface. */
const TAB_W = 118;
const TAB_H = 30;
/** How far the tab's fill dips past the card's top border — enough to hide
    the border stroke under the chip, shallow enough to stay inside the
    card's top padding (the title starts 14px in). */
const TAB_OVERLAP = 10;
/** Side strokes stop this far past the card border, where the fill takes over. */
const TAB_STROKE_OVERLAP = 4;

/**
 * A card as it appears on the thought map: a fixed-size, hand-drawn mini card
 * showing the thought core, its tags, and its visibility. Fixed dimensions
 * keep the arrow anchor math deterministic.
 */
export const ThoughtMapNode = memo(function ThoughtMapNode({
  card,
  x,
  y,
  selected,
  linkTarget,
  dragging,
  onPointerDown,
  onStartLink,
  onOpen,
  onRemove,
  linkHandleLabel,
  openLabel,
  removeLabel,
}: ThoughtMapNodeProps) {
  const hue = nodeHue(card);
  const seed = seedFromString(card.id);
  const emphasized = selected || linkTarget;
  const isDraft = card.publishedAt == null;
  const clipId = useId().replace(/:/g, '');

  // The tab's wobbly outline extends TAB_OVERLAP + slack below the visible
  // chip; the stroke is clipped just past the card border so only the left/
  // top/right sides draw, while the (unclipped) fill merges into the card.
  const tabPath = useMemo(
    () => wobRect(TAB_W, TAB_H + TAB_OVERLAP, 12, seed + 11, 2.4, { segmentsH: 2, segmentsV: 2, curve: 1.4 }),
    [seed],
  );

  return (
    <div
      className={styles.node}
      data-selected={selected || undefined}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H }}
      onPointerDown={onPointerDown}
      onDoubleClick={onOpen}
      role="button"
      tabIndex={-1}
    >
      {/* Selection deepens the card's own hue (fill + stroke) rather than
          switching to the accent color, so a blue card selects as darker blue. */}
      <HandDrawnBorder
        w={NODE_W}
        h={NODE_H}
        R={18}
        seed={seed}
        fillColor={emphasized ? `oklch(92.5% 0.045 ${hue})` : `oklch(97.5% 0.012 ${hue})`}
        strokeColor={emphasized ? `oklch(38% 0.13 ${hue})` : `oklch(52% 0.11 ${hue})`}
        strokeWidth={emphasized ? INK_STRONG : INK}
        chalkSeed={seed % 6}
        segmentsH={[3, 4]}
        segmentsV={2}
        curve={1}
        cornerJitter={0.8}
        cornerOffset={3}
      />
      <div className={styles.nodeContent}>
        <div className={styles.nodeTitle}>{card.thoughtCore}</div>
        <p className={styles.nodeExcerpt}>{plainExcerpt(card.story, 72)}</p>
        <div className={styles.nodeMeta}>
          <Icon name={isDraft ? 'pen' : VISIBILITY_ICON[card.visibility]} size={14} />
          <span className={styles.nodeTags}>{card.tags.map((t) => `#${t}`).join(' ')}</span>
        </div>
      </div>
      <button
        type="button"
        className={styles.linkHandle}
        aria-label={linkHandleLabel}
        onPointerDown={onStartLink}
      >
        <Icon name="arrow-right" size={14} />
      </button>
      {selected && !dragging && (
        <div className={styles.nodeTab} onPointerDown={(e) => e.stopPropagation()}>
          <svg
            className={styles.nodeTabChrome}
            width={TAB_W}
            height={TAB_H}
            viewBox={`0 0 ${TAB_W} ${TAB_H}`}
            aria-hidden="true"
          >
            <defs>
              <clipPath id={`tab-${clipId}`}>
                {/* Ends just past the card's top border: the bottom edge of the
                    outline never draws, so the chip opens into the card. */}
                <rect x={-6} y={-6} width={TAB_W + 12} height={TAB_H + TAB_STROKE_OVERLAP + 6} />
              </clipPath>
            </defs>
            <path d={tabPath} fill={`oklch(92.5% 0.045 ${hue})`} stroke="none" />
            <path
              d={tabPath}
              fill="none"
              stroke={`oklch(38% 0.13 ${hue})`}
              strokeWidth={INK_STRONG}
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#tab-${clipId})`}
            />
          </svg>
          <div className={styles.nodeTabRow}>
            <button type="button" className={styles.nodeTabBtn} onClick={onOpen}>
              {openLabel}
            </button>
            <button
              type="button"
              className={styles.nodeTabBtn}
              aria-label={removeLabel}
              title={removeLabel}
              onClick={onRemove}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
