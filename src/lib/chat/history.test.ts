import { describe, it, expect } from 'vitest';
import type { Message } from '@/lib/db/types';
import { MessageHistory, type HistoryEntry } from './history';

/**
 * What the thread holds of a conversation: the live window (the newest few)
 * merged with older pages read on demand, ordered by send time, with the
 * cursor of the oldest message to read the next page from.
 */
const message = (n: number, extra: Partial<Message> = {}): Message => ({
  id: `m${String(n).padStart(3, '0')}`,
  senderId: 'alice',
  text: `m${n}`,
  sentAt: new Date(1_000 * n),
  ...extra,
});
/** Newest first, as the listener's and the pages' queries return them. */
const entries = (from: number, to: number): HistoryEntry<string>[] => {
  const out: HistoryEntry<string>[] = [];
  for (let n = from; n >= to; n--) out.push({ message: message(n), cursor: `cursor-${n}` });
  return out;
};
const ids = (h: MessageHistory<string>) => h.messages.map((m) => m.id);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => message(a + i).id);

describe('MessageHistory', () => {
  it('holds the window oldest first, whatever order it arrives in', () => {
    const history = new MessageHistory<string>(3);
    expect(history.mergeWindow(entries(5, 3))).toBe('changed');
    expect(ids(history)).toEqual(['m003', 'm004', 'm005']);
    expect(history.oldestCursor).toBe('cursor-3');
  });

  it('keeps the messages that slide out of the window', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(5, 3));
    // Two new messages push the oldest two out of the newest-three window.
    history.mergeWindow(entries(7, 5));
    expect(ids(history)).toEqual(range(3, 7));
    // The next older page still starts after the oldest held.
    expect(history.oldestCursor).toBe('cursor-3');
    expect(history.hasOlder).toBe(true);
  });

  it('puts an older page before and moves the cursor; a short page was the last', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(10, 8));
    expect(history.mergePage(entries(7, 5), 3)).toBe(true);
    expect(ids(history)).toEqual(range(5, 10));
    expect(history.oldestCursor).toBe('cursor-5');
    expect(history.hasOlder).toBe(true);

    expect(history.mergePage(entries(4, 3), 3)).toBe(true);
    expect(history.oldestCursor).toBe('cursor-3');
    expect(history.hasOlder).toBe(false);
    // The window moving on afterwards doesn't say there is more.
    history.mergeWindow(entries(11, 9));
    expect(history.hasOlder).toBe(false);
    expect(history.size).toBe(9);
  });

  it('takes a window shorter than the limit from the server as the whole conversation, but not one from the cache', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(2, 1));
    expect(history.hasOlder).toBe(false);
    history.mergeWindow(entries(3, 1));
    expect(history.hasOlder).toBe(true);

    const cached = new MessageHistory<string>(3);
    cached.mergeWindow(entries(2, 1), false);
    expect(cached.hasOlder).toBe(true);
    // The server's answer settles it.
    cached.mergeWindow(entries(2, 1), true);
    expect(cached.hasOlder).toBe(false);
  });

  it('has nothing older for an empty conversation', () => {
    const history = new MessageHistory<string>(3);
    expect(history.mergeWindow([])).toBe('unchanged');
    expect(history.hasOlder).toBe(false);
    expect(history.oldestCursor).toBeNull();
  });

  it('replaces an updated message (a preview arriving), and keeps the list when nothing changed', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(5, 3));
    const preview = { url: 'https://example.com/', title: 'Example' };
    const window = [
      { message: message(5), cursor: 'cursor-5' },
      { message: message(4, { preview }), cursor: 'cursor-4' },
      { message: message(3), cursor: 'cursor-3' },
    ];
    expect(history.mergeWindow(window)).toBe('changed');
    expect(history.size).toBe(3);
    expect(history.get('m004')!.preview).toEqual(preview);

    // The same window again — fresh objects, as every snapshot hands over — changes nothing.
    const before = history.messages;
    const held = history.get('m004');
    expect(history.mergeWindow(window.map((e) => ({ ...e, message: { ...e.message } })))).toBe('unchanged');
    expect(history.messages).toBe(before);
    expect(history.get('m004')).toBe(held);
  });

  it("refreshes the cursor when the oldest message's document comes again", () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(5, 3));
    history.mergeWindow([
      { message: message(5), cursor: 'c5' },
      { message: message(4), cursor: 'c4' },
      { message: message(3), cursor: 'c3-again' },
    ]);
    expect(history.oldestCursor).toBe('c3-again');
  });

  it('orders messages sent together by id', () => {
    const history = new MessageHistory<string>(5);
    const at = new Date(5_000);
    history.mergeWindow(['b', 'c', 'a'].map((id) => ({ message: { id, senderId: 'alice', text: id, sentAt: at }, cursor: id })));
    expect(ids(history)).toEqual(['a', 'b', 'c']);
    expect(history.oldestCursor).toBe('a');
  });

  it('starts afresh from a window that shares nothing with what it holds', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(5, 3));
    history.mergePage(entries(2, 1), 2);
    // The listener was away while the thread moved far past what was held: there would be a gap.
    expect(history.mergeWindow(entries(40, 38))).toBe('restarted');
    expect(ids(history)).toEqual(range(38, 40));
    expect(history.oldestCursor).toBe('cursor-38');
    expect(history.hasOlder).toBe(true);
  });

  it('forgets everything on clear', () => {
    const history = new MessageHistory<string>(3);
    history.mergeWindow(entries(5, 3));
    history.clear();
    expect(history.messages).toEqual([]);
    expect(history.oldestCursor).toBeNull();
    expect(history.hasOlder).toBe(false);
    expect(history.has('m003')).toBe(false);
  });

  it('listens to fifty by default', () => {
    const history = new MessageHistory<string>();
    history.mergeWindow(entries(60, 11));
    expect(history.size).toBe(50);
    expect(history.hasOlder).toBe(true);
  });
});
