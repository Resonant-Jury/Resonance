'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** What a live (onSnapshot) subscription has heard: its latest answer, and its error once it failed. */
export interface LiveState<T> {
  /** Undefined until the first answer. */
  data: T | undefined;
  error: Error | null;
}

/** Starts a listener, reporting each answer and a failure; returns its stop. */
export type StartListener<T> = (emit: (data: T) => void, fail: (err: Error) => void) => () => void;

interface Entry {
  state: LiveState<unknown>;
  readers: Set<() => void>;
  start: StartListener<unknown>;
  stop: () => void;
  linger: ReturnType<typeof setTimeout> | null;
}

const NOTHING_YET: LiveState<never> = { data: undefined, error: null };

/**
 * How long a listener outlives its last reader. Leaving a signed-in page for
 * the editor (which has no header) and coming back keeps the badges' listeners
 * rather than reading every conversation again.
 */
export const LINGER_MS = 60_000;

const entries = new Map<string, Entry>();

/** Run `fn` once the browser is idle (the page's own reads go first); returns a cancel. */
function whenIdle(fn: () => void): () => void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const id = window.requestIdleCallback(fn, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(fn, 0);
  return () => clearTimeout(id);
}

function begin(entry: Entry): void {
  const set = (state: LiveState<unknown>) => {
    entry.state = state;
    entry.readers.forEach((notify) => notify());
  };
  let stopListener: (() => void) | null = null;
  const cancel = whenIdle(() => {
    stopListener = entry.start(
      (data) => set({ data, error: null }),
      // Keep what was heard; the error says it has stopped being live.
      (error) => set({ data: entry.state.data, error }),
    );
  });
  entry.stop = () => {
    cancel();
    stopListener?.();
  };
}

// A listener that failed (the SDK drops it) starts again the next time the
// reader comes back to the tab or back online. The SDK retries short outages
// on its own; this is for one that ended the listener.
function restartFailed(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  for (const entry of entries.values()) {
    if (!entry.state.error || entry.readers.size === 0) continue;
    entry.stop();
    begin(entry);
  }
}
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', restartFailed);
  window.addEventListener('online', restartFailed);
}

function subscribe(key: string, start: StartListener<unknown>, notify: () => void): () => void {
  let entry = entries.get(key);
  if (!entry) {
    entry = { state: NOTHING_YET, readers: new Set(), start, stop: () => {}, linger: null };
    entries.set(key, entry);
    begin(entry);
  }
  const e = entry;
  if (e.linger) {
    clearTimeout(e.linger);
    e.linger = null;
  }
  e.readers.add(notify);
  return () => {
    e.readers.delete(notify);
    if (e.readers.size > 0) return;
    e.linger = setTimeout(() => {
      e.stop();
      entries.delete(key);
    }, LINGER_MS);
  };
}

/**
 * One listener per `key`, shared by every component reading it, started when
 * the browser is idle after the first one mounts and stopped a while after
 * the last one leaves. `start` is only called for a key with no listener yet:
 * everything it listens to belongs in the key. A null key reads nothing.
 */
export function useLive<T>(key: string | null, start: StartListener<T>): LiveState<T> {
  // `start` is deliberately not a dependency: the key names what it listens to.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sub = useCallback((notify: () => void) => (key ? subscribe(key, start as StartListener<unknown>, notify) : () => {}), [key]);
  const read = () => ((key && entries.get(key)?.state) || NOTHING_YET) as LiveState<T>;
  return useSyncExternalStore(sub, read, () => NOTHING_YET);
}

/** Stop and forget every listener at once (tests). */
export function resetLive(): void {
  for (const entry of entries.values()) {
    if (entry.linger) clearTimeout(entry.linger);
    entry.stop();
  }
  entries.clear();
}
