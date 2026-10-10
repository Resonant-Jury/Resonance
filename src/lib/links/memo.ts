/**
 * What became of each thing asked for, by key, for a while. A link preview and
 * a preview's picture both make this server fetch an address a stranger
 * chose; whoever may ask can ask again and again, so the work is done once
 * and the outcome — a failure too — is remembered, and a second ask that
 * arrives while the first is still running joins it.
 *
 * Held in memory, per instance, bounded (the oldest key goes first) and
 * expiring lazily: no timers, nothing to clean up, nothing shared between
 * instances — a cold instance simply does the work again.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface MemoOptions<T> {
  /** At most this many keys. */
  max?: number;
  /** How long an outcome is remembered, in ms; 0 forgets it at once (an answer that says nothing about the key). */
  keep: (outcome: Outcome<T>, key: string) => number;
  now?: () => number;
}

export interface Memo<T> {
  readonly size: number;
  /** The remembered outcome of `key`, or `make()`'s — shared by every ask until it settles. */
  get(key: string, make: () => Promise<T>): Promise<T>;
}

export function createMemo<T>(options: MemoOptions<T>): Memo<T> {
  const { max = 100, keep, now = Date.now } = options;
  const entries = new Map<string, { until: number; result: Promise<T> }>();
  return {
    get size() {
      return entries.size;
    },
    get(key, make) {
      const known = entries.get(key);
      if (known && known.until > now()) return known.result;
      entries.delete(key);
      const entry = { until: Infinity, result: make() };
      entries.set(key, entry);
      while (entries.size > max) entries.delete(entries.keys().next().value!);
      const settle = (outcome: Outcome<T>) => {
        const ms = keep(outcome, key);
        if (ms > 0) entry.until = now() + ms;
        else if (entries.get(key) === entry) entries.delete(key);
      };
      entry.result.then(
        (value) => settle({ ok: true, value }),
        (error: unknown) => settle({ ok: false, error }),
      );
      return entry.result;
    },
  };
}
