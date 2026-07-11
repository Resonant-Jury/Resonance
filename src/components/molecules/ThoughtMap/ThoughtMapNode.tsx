'use client';

import { memo, useId, useMemo, type CSSProperties, type PointerEvent } from 'react';
import { HandDrawnBorder } from '@/components/atoms/HandDrawnBorder/HandDrawnBorder';
import { Icon } from '@/components/atoms/Icon';
import { INK, INK_STRONG } from '@/lib/design/strokes';
import { seedFromString } from '@/lib/design/prng';
import { wobRect } from '@/lib/design/wobRect';
import { wobTabRect } from '@/lib/design/wobTabRect';
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

/** The card's little visual, if it has one: attached media, else the story's
    first inline markdown image. */
function cardThumb(card: Card): string | null {
  if (card.media?.type === 'image') return card.media.url;
  const m = card.story.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/);
  return m ? m[1] : null;
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

/* The selected card's action tab: a bump on the card's own outline (drawn by
   wobTabRect as one closed path with the border), left-aligned like a file
   folder tab. */
const TAB_X = 12;
const TAB_W = 118;
const TAB_H = 30;

/**
 * A card as it appears on the thought map: a fixed-size, hand-drawn mini card
 * showing the thought core, its tags, its visibility — and a small organic
 * thumbnail when the card carries an image. Fixed dimensions keep the arrow
 * anchor math deterministic.
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
  const thumb = cardThumb(card);
  const tabbed = selected && !dragging;

  // One outline for card + tab: stroke and fill are a single hand-drawn shape,
  // so nothing overlaps, misaligns, or pokes past the card edge.
  const tabbedPath = useMemo(
    () => wobTabRect(NODE_W, NODE_H, TAB_X, TAB_W, TAB_H, seed, { R: 18, tabR: 9, mag: 2.4, curve: 1 }),
    [seed],
  );

  return (
    <div
      className={styles.node}
      data-selected={selected || undefined}
      style={{ left: x, top: y, width: NODE_W, height: NODE_H, '--node-hue': hue } as CSSProperties}
      onPointerDown={onPointerDown}
      onDoubleClick={onOpen}
      role="button"
      tabIndex={-1}
    >
      {/* Selection deepens the card's own hue (fill + stroke) rather than
          switching to the accent color, so a blue card selects as darker blue. */}
      {tabbed ? (
        <svg
          aria-hidden="true"
          className="res-shape-fade-in"
          width={NODE_W}
          height={NODE_H + TAB_H}
          viewBox={`0 0 ${NODE_W} ${NODE_H + TAB_H}`}
          style={{
            position: 'absolute',
            top: -TAB_H,
            left: 0,
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        >
          <path d={tabbedPath} fill={`oklch(92.5% 0.045 ${hue})`} />
          <path
            d={tabbedPath}
            fill="none"
            stroke={`oklch(38% 0.13 ${hue})`}
            strokeWidth={INK_STRONG}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
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
      )}
      <div className={styles.nodeContent}>
        <div className={styles.nodeBody}>
          <div className={styles.nodeText}>
            <div className={styles.nodeTitle}>{card.thoughtCore}</div>
            <p className={styles.nodeExcerpt}>{plainExcerpt(card.story, thumb ? 48 : 72)}</p>
          </div>
          {thumb && <NodeThumb src={thumb} seed={seed} hue={hue} />}
        </div>
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
      {tabbed && (
        <div className={styles.nodeTab} onPointerDown={(e) => e.stopPropagation()}>
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

/** 46px organic-clipped thumbnail, top-right of the node body. */
function NodeThumb({ src, seed, hue }: { src: string; seed: number; hue: number }) {
  const uid = useId().replace(/:/g, '');
  const S = 46;
  const path = useMemo(
    () => wobRect(S, S, 12, seed + 3, 1.8, { segmentsH: 2, segmentsV: 2, curve: 1.3, cornerJitter: 1.4 }),
    [seed],
  );
  return (
    <svg
      width={S}
      height={S}
      viewBox={`0 0 ${S} ${S}`}
      className={styles.nodeThumb}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`nodethumb-${uid}`}>
          <path d={path} />
        </clipPath>
      </defs>
      <image
        href={src}
        x={-4}
        y={-4}
        width={S + 8}
        height={S + 8}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#nodethumb-${uid})`}
      />
      <path
        d={path}
        fill="none"
        stroke={`oklch(52% 0.11 ${hue} / 0.55)`}
        strokeWidth={INK}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
