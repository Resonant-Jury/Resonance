'use client';

import { useEffect, useRef, useState } from 'react';
import { syncHintCount } from '@/lib/db/firestore/client/hints';
import { useMyProfile } from '@/lib/data/hooks';

/**
 * Just-in-time micro-hints (微說明) — the mechanism that replaces tutorial
 * pages. Each hint renders inline, in place, exactly where the user is about
 * to act, for its first {@link HINT_LIMIT} displays; after that it collapses
 * forever. Never a modal, never a walkthrough.
 *
 * Seen-counts live in localStorage (`hint:{key}`) and are mirrored to the
 * signed-in user's `hintsSeen` map so another device doesn't replay them.
 */
export const HINT_LIMIT = 3;

const storageKey = (key: string) => `hint:${key}`;

export function readLocalHintCount(key: string): number {
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeLocalHintCount(key: string, count: number): void {
  try {
    window.localStorage.setItem(storageKey(key), String(count));
  } catch {
    // storage unavailable (private mode) — the hint just shows again
  }
}

export interface HintState {
  /** Render the hint only while this is true. */
  visible: boolean;
  /** Permanently collapse the hint (counts as having seen it enough). */
  dismiss: () => void;
}

/**
 * `useHint('note-privacy')` → show the hint while it has been displayed fewer
 * than {@link HINT_LIMIT} times (each mount counts as one display). Starts
 * hidden so SSR and the client's first paint agree, then reveals in an effect.
 */
export function useHint(key: string): HintState {
  const [visible, setVisible] = useState(false);
  // The viewer's profile carries the cross-device count; undefined while
  // loading (or anonymous), in which case the local count alone decides.
  const { data: me } = useMyProfile();
  const remoteCount = me?.hintsSeen?.[key];
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    const count = Math.max(readLocalHintCount(key), remoteCount ?? 0);
    if (count >= HINT_LIMIT) return;
    writeLocalHintCount(key, count + 1);
    void syncHintCount(key, count + 1);
    setVisible(true);
    // Count once per mount, on the first settled render — deliberately not
    // re-run when the profile arrives later (worst case: one extra display).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return {
    visible,
    dismiss: () => {
      setVisible(false);
      writeLocalHintCount(key, HINT_LIMIT);
      void syncHintCount(key, HINT_LIMIT);
    },
  };
}
