import type { Firestore } from 'firebase-admin/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentMessage } from './conversations';

// What happens after a message's response: the push and the link preview,
// side by side, neither able to stop the other or reach the sender.

const later: Promise<void>[] = [];
vi.mock('next/server', () => ({
  // `after` runs its callback once the response is out; here it just runs, and the test waits for it.
  after: (work: () => Promise<void>) => later.push(work()),
}));

const messaging = { sendEachForMulticast: vi.fn() };
const getAdminMessaging = vi.fn(async () => messaging);
vi.mock('@/lib/db/firestore/admin', () => ({ getAdminMessaging: () => getAdminMessaging() }));

const pushMessage = vi.fn();
vi.mock('@/lib/push/chat', () => ({ pushMessage: (...args: unknown[]) => pushMessage(...args) }));

const unfurlMessage = vi.fn();
vi.mock('@/lib/links/preview', () => ({ unfurlMessage: (...args: unknown[]) => unfurlMessage(...args) }));

import { afterMessageSent } from './afterMessage';

const db = {} as Firestore;
const push = { conversationId: 'alice_bob', messageId: 'm1', from: 'alice', to: 'bob' };
const sent = (over: Partial<SentMessage> = {}): SentMessage => ({
  conversationId: 'alice_bob',
  id: 'm1',
  notificationId: null,
  duplicate: false,
  push,
  ...over,
});

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  later.length = 0;
  pushMessage.mockReset().mockResolvedValue({ sent: 1, pruned: 0 });
  unfurlMessage.mockReset().mockResolvedValue(null);
  getAdminMessaging.mockClear();
  error = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const settle = () => Promise.all(later);

describe('afterMessageSent', () => {
  it("rings the recipient and unfurls the message's link", async () => {
    afterMessageSent(db, sent());
    await settle();
    expect(pushMessage).toHaveBeenCalledWith(db, push, messaging);
    expect(unfurlMessage).toHaveBeenCalledWith(db, 'alice_bob', 'm1');
  });

  it('does both at once: a slow page never holds up the buzz', async () => {
    let finishUnfurl!: () => void;
    unfurlMessage.mockReturnValue(new Promise<null>((resolve) => (finishUnfurl = () => resolve(null))));
    afterMessageSent(db, sent());
    await vi.waitFor(() => expect(pushMessage).toHaveBeenCalledTimes(1));
    expect(unfurlMessage).toHaveBeenCalledTimes(1);
    finishUnfurl();
    await settle();
  });

  it('still unfurls when the push fails, and still pushes when the unfurl fails, logging each', async () => {
    pushMessage.mockRejectedValue(new Error('fcm down'));
    afterMessageSent(db, sent());
    await settle();
    expect(unfurlMessage).toHaveBeenCalledTimes(1);

    pushMessage.mockResolvedValue(null);
    unfurlMessage.mockRejectedValue(new Error('page exploded'));
    afterMessageSent(db, sent());
    await settle();
    expect(pushMessage).toHaveBeenCalledTimes(2);

    const logged = error.mock.calls.map((c) => c.join(' '));
    expect(logged.some((l) => l.startsWith('[push]') && l.includes('fcm down'))).toBe(true);
    expect(logged.some((l) => l.startsWith('[unfurl]') && l.includes('page exploded'))).toBe(true);
  });

  it('unfurls even when Firebase Messaging cannot be reached at all', async () => {
    getAdminMessaging.mockRejectedValueOnce(new Error('no credentials'));
    afterMessageSent(db, sent());
    await settle();
    expect(pushMessage).not.toHaveBeenCalled();
    expect(unfurlMessage).toHaveBeenCalledTimes(1);
  });

  it('never throws into the response, whatever the jobs do', async () => {
    pushMessage.mockImplementation(async () => {
      throw new Error('failure');
    });
    unfurlMessage.mockImplementation(async () => {
      throw new Error('failure');
    });
    expect(() => afterMessageSent(db, sent())).not.toThrow();
    await expect(settle()).resolves.toBeDefined();
  });

  it('does nothing for a message that was only sent again: it has been pushed and unfurled already', async () => {
    afterMessageSent(db, sent({ duplicate: true }));
    afterMessageSent(db, sent({ push: null }));
    await settle();
    expect(later).toHaveLength(0);
    expect(pushMessage).not.toHaveBeenCalled();
    expect(unfurlMessage).not.toHaveBeenCalled();
  });
});
