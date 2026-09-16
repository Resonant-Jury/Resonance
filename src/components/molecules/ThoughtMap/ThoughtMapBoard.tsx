'use client';

import { useCallback } from 'react';
import { useMyThoughtMap } from '@/lib/data/hooks';
import type { Card } from '@/lib/db/types';
import { ThoughtMapCanvas, type BoardSnapshot } from './ThoughtMapCanvas';
import styles from './ThoughtMap.module.css';

export interface ThoughtMapBoardProps {
  /** CSS height of the board; the canvas fills it. */
  height?: string;
  /** Edge-to-edge mode (no rounded frame, dots bleed to the edges). */
  flush?: boolean;
  /** Host override for「開啟卡片」(see {@link ThoughtMapCanvas}). */
  onOpenCard?: (card: Card) => void;
  /** Whether the host's editor pane is open — drives the camera recenter. */
  paneOpen?: boolean;
}

/**
 * Data wiring for the thought map: loads the viewer's map + cards, then hands
 * everything to the canvas. The canvas mutates optimistically and writes
 * through to Firestore, so this also folds every change back into the SWR
 * cache: the cached entry outlives the board (leaving for the card editor and
 * coming back remounts it), and a canvas seeded from a pre-edit snapshot would
 * look exactly like the map had forgotten the positions and arrows just made.
 */
export function ThoughtMapBoard({
  height = 'clamp(480px, 64vh, 760px)',
  flush = false,
  onOpenCard,
  paneOpen = false,
}: ThoughtMapBoardProps) {
  const { data, mutate } = useMyThoughtMap();

  const onBoardChange = useCallback(
    (board: BoardSnapshot) => {
      void mutate(
        (prev) => {
          if (!prev) return prev;
          // Keep the server-side timestamps of rows that already existed; a
          // freshly placed node/arrow/region is stamped now (the canvas only
          // reports state it has already written through).
          const now = new Date();
          const prevNodes = new Map(prev.nodes.map((n) => [n.cardId, n]));
          const prevEdges = new Map(prev.edges.map((e) => [e.id, e]));
          const prevGroups = new Map(prev.groups.map((g) => [g.id, g]));
          return {
            ...prev,
            nodes: board.nodes.map((n) => ({
              id: n.cardId,
              createdAt: prevNodes.get(n.cardId)?.createdAt ?? now,
              ...n,
              groupId: n.groupId ?? undefined,
              updatedAt: now,
            })),
            edges: board.edges.map((e) => ({
              createdAt: prevEdges.get(e.id)?.createdAt ?? now,
              ...e,
            })),
            groups: board.groups.map((g) => ({
              createdAt: prevGroups.get(g.id)?.createdAt ?? now,
              ...g,
            })),
          };
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  if (!data)
    return (
      <div
        className={flush ? undefined : styles.skeleton}
        style={{ height }}
        aria-busy="true"
      />
    );
  return (
    <ThoughtMapCanvas
      data={data}
      style={{ height }}
      flush={flush}
      onOpenCard={onOpenCard}
      paneOpen={paneOpen}
      onBoardChange={onBoardChange}
    />
  );
}
