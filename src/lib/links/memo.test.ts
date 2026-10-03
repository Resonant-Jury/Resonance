import { describe, expect, it, vi } from 'vitest';
import { createMemo } from './memo';

// The memory behind both fetchers: do the work once per key, remember the
// outcome as long as the caller says, and never hold more than it may.

const keepFor = (ok: number, failed = 0) => (outcome: { ok: boolean }) => (outcome.ok ? ok : failed);

describe('createMemo', () => {
  it('does the work once per key, and gives every ask the same answer', async () => {
    const memo = createMemo<string>({ keep: keepFor(1000) });
    const make = vi.fn(async () => 'answer');
    expect(await memo.get('a', make)).toBe('answer');
    expect(await memo.get('a', make)).toBe('answer');
    await memo.get('b', make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('lets asks that arrive together share the work in flight', async () => {
    const memo = createMemo<number>({ keep: keepFor(1000) });
    let finish!: (n: number) => void;
    const make = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    const all = Promise.all([memo.get('a', make), memo.get('a', make), memo.get('a', make)]);
    expect(make).toHaveBeenCalledTimes(1);
    finish(7);
    expect(await all).toEqual([7, 7, 7]);
  });

  it('forgets an outcome when its time is up, each kind after its own time', async () => {
    let now = 0;
    const memo = createMemo<string>({ keep: keepFor(1000, 100), now: () => now });
    const make = vi.fn<() => Promise<string>>().mockResolvedValue('ok');
    await memo.get('good', make);
    make.mockRejectedValueOnce(new Error('nope'));
    await expect(memo.get('bad', make)).rejects.toThrow('nope');
    expect(make).toHaveBeenCalledTimes(2);

    now = 99;
    await memo.get('good', make);
    await expect(memo.get('bad', make)).rejects.toThrow('nope'); // the same failure, not asked again
    expect(make).toHaveBeenCalledTimes(2);

    now = 101;
    expect(await memo.get('bad', make)).toBe('ok'); // asked again
    await memo.get('good', make);
    expect(make).toHaveBeenCalledTimes(3);

    now = 1001;
    await memo.get('good', make);
    expect(make).toHaveBeenCalledTimes(4);
  });

  it('does not remember an outcome it is told to forget at once', async () => {
    const memo = createMemo<string>({ keep: () => 0 });
    const make = vi.fn(async () => 'x');
    await memo.get('a', make);
    await memo.get('a', make);
    expect(make).toHaveBeenCalledTimes(2);
    expect(memo.size).toBe(0);
  });

  it('keeps no more keys than it is allowed, dropping the oldest first', async () => {
    const memo = createMemo<string>({ max: 3, keep: keepFor(1000) });
    const make = vi.fn(async () => 'x');
    for (const key of ['a', 'b', 'c', 'd', 'e']) await memo.get(key, make);
    expect(memo.size).toBe(3);
    await memo.get('e', make);
    expect(make).toHaveBeenCalledTimes(5);
    await memo.get('a', make);
    expect(make).toHaveBeenCalledTimes(6);
  });
});
