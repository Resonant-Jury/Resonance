'use client';

type Realtime = typeof import('./realtime');

/**
 * Start a listener on the full SDK (./realtime), which loads with the first
 * listener rather than with every page — the one way into it (sdk.test.ts
 * checks no module imports it statically). Returns the unsubscribe function,
 * safe to call before the listener has started.
 */
export function listenLazily(
  start: (realtime: Realtime) => () => void,
  onError?: (err: Error) => void,
): () => void {
  let stopped = false;
  let stop: (() => void) | null = null;
  import('./realtime')
    .then((realtime) => {
      if (!stopped) stop = start(realtime);
    })
    .catch((err: unknown) => {
      if (!stopped) onError?.(err instanceof Error ? err : new Error(String(err)));
    });
  return () => {
    stopped = true;
    stop?.();
  };
}
