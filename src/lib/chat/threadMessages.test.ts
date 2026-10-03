import { describe, it, expect } from 'vitest';
import type { Message } from '@/lib/db/types';
import { MessageHistory } from './history';
import type { Outgoing } from './outbox';
import { ThreadMessages } from './threadMessages';

/** The thread draws its history, then the viewer's messages on their way — each kept by one key from send to document. */
const doc = (id: string, sec: number, extra: Partial<Message> = {}): Message => ({
  id,
  senderId: 'me',
  text: id,
  sentAt: new Date(sec * 1000),
  ...extra,
});
const outgoing = (clientId: string, status: Outgoing['status'], serverId?: string): Outgoing => ({
  clientId,
  senderId: 'me',
  text: clientId,
  queuedAt: new Date(99_000),
  status,
  ...(serverId ? { serverId } : {}),
});
const historyOf = (...messages: Message[]) => {
  const h = new MessageHistory<string>();
  h.mergeWindow(messages.map((m) => ({ message: m, cursor: m.id })));
  return h;
};

describe('ThreadMessages', () => {
  it('draws the history, then the messages still on their way', () => {
    const thread = new ThreadMessages();
    const drawn = thread.build(historyOf(doc('m1', 1), doc('m2', 2)), [outgoing('c1', 'sending'), outgoing('c2', 'failed')]);
    expect(drawn.map((m) => [m.key, m.delivery])).toEqual([
      ['m1', 'delivered'],
      ['m2', 'delivered'],
      ['c1', 'sending'],
      ['c2', 'failed'],
    ]);
  });

  it('replaces a message on its way by its document, under the same key', () => {
    const thread = new ThreadMessages();
    const before = thread.build(historyOf(doc('m1', 1)), [outgoing('c1', 'sent', 'c1')]);
    expect(before.map((m) => m.key)).toEqual(['m1', 'c1']);
    // The server made the client id the document id.
    const after = thread.build(historyOf(doc('m1', 1), doc('c1', 2)), [outgoing('c1', 'sent', 'c1')]);
    expect(after.map((m) => [m.key, m.delivery])).toEqual([
      ['m1', 'delivered'],
      ['c1', 'delivered'],
    ]);
  });

  it('carries the key over to a document an older server gave an id of its own', () => {
    const thread = new ThreadMessages();
    thread.build(historyOf(doc('m1', 1)), [outgoing('c1', 'sent', 'srv-9')]);
    const after = thread.build(historyOf(doc('m1', 1), doc('srv-9', 2)), [outgoing('c1', 'sent', 'srv-9')]);
    expect(after.map((m) => [m.id, m.key])).toEqual([
      ['m1', 'm1'],
      ['srv-9', 'c1'],
    ]);
    // And keeps it once the outbox has let the message go.
    expect(thread.build(historyOf(doc('m1', 1), doc('srv-9', 2)), []).map((m) => m.key)).toEqual(['m1', 'c1']);
  });

  it('hands back the same object for a message that did not change', () => {
    const thread = new ThreadMessages();
    const history = historyOf(doc('m1', 1), doc('m2', 2));
    const box = [outgoing('c1', 'sending')];
    const first = thread.build(history, box);
    history.mergeWindow([{ message: doc('m3', 3), cursor: 'm3' }, { message: doc('m2', 2), cursor: 'm2' }]);
    const second = thread.build(history, box);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[3]).toBe(first[2]);
  });

  it('carries nothing over after clear', () => {
    const thread = new ThreadMessages();
    thread.build(historyOf(doc('m1', 1)), [outgoing('c1', 'sent', 'srv-9')]);
    thread.clear();
    expect(thread.build(historyOf(doc('srv-9', 2)), []).map((m) => m.key)).toEqual(['srv-9']);
  });
});
