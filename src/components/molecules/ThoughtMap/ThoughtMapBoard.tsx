'use client';

import { useMyThoughtMap } from '@/lib/data/hooks';
import type { Card } from '@/lib/db/types';
import { ThoughtMapCanvas } from './ThoughtMapCanvas';
import styles from './ThoughtMap.module.css';

export interface ThoughtMapBoardProps {
  /** CSS height of the board; the canvas fills it. */
  height?: string;
  /** Edge-to-edge mode (no rounded frame, dots bleed to the edges). */
  flush?: boolean;
  /** Host override for「開啟卡片」(see {@link ThoughtMapCanvas}). */
  onOpenCard?: (card: Card) => void;
}

/**
 * Data wiring for the thought map: loads the viewer's map + cards, then hands
 * everything to the canvas. Keyed remount when the data arrives gives the
 * canvas a clean initial state (it owns its state optimistically after load).
 */
export function ThoughtMapBoard({
  height = 'clamp(480px, 64vh, 760px)',
  flush = false,
  onOpenCard,
}: ThoughtMapBoardProps) {
  const { data } = useMyThoughtMap();
  if (!data)
    return (
      <div
        className={flush ? undefined : styles.skeleton}
        style={{ height }}
        aria-busy="true"
      />
    );
  return <ThoughtMapCanvas data={data} style={{ height }} flush={flush} onOpenCard={onOpenCard} />;
}
