import { beforeEach, describe, expect, it, vi } from 'vitest';

// ringAfter: bell rows pushed after the response — given as ids, or as the
// work that writes one (a resonance's reach after the change that made it
// reachable). Nothing runs before the response, and a failure rings no one
// without stopping the rest.

let afterWork: (() => unknown)[] = [];
vi.mock('next/server', () => ({ after: (fn: () => unknown) => void afterWork.push(fn) }));
const messaging = { send: vi.fn() };
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminMessaging: async () => messaging }));
const pushNotification = vi.fn(async (..._a: unknown[]) => ({ sent: 1, pruned: 0 }));
vi.mock('./send', () => ({ pushNotification: (...a: unknown[]) => pushNotification(...a) }));

const { ringAfter } = await import('./ring');
const db = {} as Parameters<typeof ringAfter>[0];
const runAfter = async () => {
  for (const work of afterWork) await work();
};

beforeEach(() => {
  vi.clearAllMocks();
  afterWork = [];
});

describe('ringAfter', () => {
  it('pushes each bell after the response, skipping none given', async () => {
    ringAfter(db, 'b1', null, undefined, 'b2');
    expect(pushNotification).not.toHaveBeenCalled();
    await runAfter();
    expect(pushNotification.mock.calls.map(([, id]) => id)).toEqual(['b1', 'b2']);
  });

  it('schedules nothing when there is nothing to ring', () => {
    ringAfter(db, null, undefined);
    expect(afterWork).toEqual([]);
  });

  it('runs the work that writes a bell only after the response, then pushes what it wrote', async () => {
    const reach = vi.fn(async () => 'resonance_alice_orig');
    ringAfter(db, reach);
    expect(reach).not.toHaveBeenCalled();
    await runAfter();
    expect(reach).toHaveBeenCalledTimes(1);
    expect(pushNotification).toHaveBeenCalledWith(db, 'resonance_alice_orig', messaging);
  });

  it('pushes nothing for work that rang no one, and logs work that failed, ringing the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ringAfter(db, async () => null, async () => Promise.reject(new Error('contention')), 'b3');
    await runAfter();
    expect(pushNotification.mock.calls.map(([, id]) => id)).toEqual(['b3']);
    expect(error).toHaveBeenCalledWith('[push]', expect.any(Error));
    error.mockRestore();
  });
});
