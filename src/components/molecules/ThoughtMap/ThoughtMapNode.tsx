'use client';

import { memo, type PointerEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import { seedFromString } from '@/lib/design/prng';
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
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onStartLink: (e: PointerEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  linkHandleLabel: string;
}

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
  onPointerDown,
  onStartLink,
  onOpen,
  linkHandleLabel,
}: ThoughtMapNodeProps) {
  const hue = nodeHue(card);
  const seed = seedFromString(card.id);
  const emphasized = selected || linkTarget;
  const isDraft = card.publishedAt == null;

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
    </div>
  );
});
