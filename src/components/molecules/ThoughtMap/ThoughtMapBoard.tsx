'use client';

import { useMyThoughtMap } from '@/lib/data/hooks';
import { ThoughtMapCanvas } from './ThoughtMapCanvas';
import styles from './ThoughtMap.module.css';

export interface ThoughtMapBoardProps {
  /** CSS height of the board; the canvas fills it. */
  height?: string;
}

/**
 * Data wiring for the thought map: loads the viewer's map + cards, then hands
 * everything to the canvas. Keyed remount when the data arrives gives the
 * canvas a clean initial state (it owns its state optimistically after load).
 */
export function ThoughtMapBoard({ height = 'clamp(480px, 64vh, 760px)' }: ThoughtMapBoardProps) {
  const { data } = useMyThoughtMap();
  if (!data) return <div className={styles.skeleton} style={{ height }} aria-busy="true" />;
  return <ThoughtMapCanvas data={data} style={{ height }} />;
}
