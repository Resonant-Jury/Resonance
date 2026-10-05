/**
 * Run `work` over `items`, at most `n` at a time, starting none once `stop()`
 * says so (a cron's time budget). A failure is logged under `tag` and the
 * rest go on. Answers how many were never started.
 */
export async function runPool<T>(
  items: T[],
  n: number,
  work: (item: T) => Promise<unknown>,
  opts: { stop?: () => boolean; tag: string },
): Promise<{ notStarted: number }> {
  const queue = [...items];
  const stop = opts.stop ?? (() => false);
  const worker = async () => {
    while (queue.length && !stop()) {
      const item = queue.shift()!;
      try {
        await work(item);
      } catch (e) {
        console.error(opts.tag, e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return { notStarted: queue.length };
}
