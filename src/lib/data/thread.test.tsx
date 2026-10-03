// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Message } from '@/lib/db/types';

// One open conversation on the real thread model (history, outbox, search):
// the client's thread reads and the send are the module boundary — a fake
// server holds the conversation, its listener hears the newest messages and
// a page read answers the ones before a cursor.

type Entry = { message: Message; cursor: { seconds: number; nanoseconds: number; id: string } };
type Window = { entries: Entry[]; fromCache: boolean };

const server = vi.hoisted(() => ({
  /** The whole conversation, oldest first. */
  all: [] as Message[],
  listeners: [] as { pairId: string; onWindow: (w: Window) => void; onError: (e: Error) => void; stopped: boolean }[],
  pageReads: [] as { id: string; max: number }[],
  /** Holds every page read until opened (null: answer at once). */
  gate: null as Promise<void> | null,
  failPages: false,
}));

const entry = (message: Message): Entry => ({
  message,
  cursor: { seconds: Math.floor(message.sentAt.getTime() / 1000), nanoseconds: 0, id: message.id },
});

vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  listenThread: vi.fn((pairId: string, onWindow: (w: Window) => void, onError: (e: Error) => void) => {
    const listener = { pairId, onWindow, onError, stopped: false };
    server.listeners.push(listener);
    return () => {
      listener.stopped = true;
    };
  }),
  getOlderMessages: vi.fn(async (_pairId: string, before: { id: string }, max: number) => {
    server.pageReads.push({ id: before.id, max });
    if (server.gate) await server.gate;
    if (server.failPages) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    const at = server.all.findIndex((m) => m.id === before.id);
    return server.all
      .slice(Math.max(0, at - max), at)
      .reverse()
      .map((message) => ({
        message,
        cursor: { seconds: Math.floor(message.sentAt.getTime() / 1000), nanoseconds: 0, id: message.id },
      }));
  }),
  sendMessage: vi.fn(),
}));

const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));

import { getOlderMessages, sendMessage } from '@/lib/db/firestore/client/messages';
import {
  ALL_PAGE,
  LOAD_ALL_CAP,
  OLDER_PAGE,
  forgetOutboxes,
  useChatThread,
  type ChatThread,
  type ChatThreadOptions,
} from './thread';

const T0 = Date.UTC(2026, 8, 1, 8);
const msg = (n: number, extra: Partial<Message> = {}): Message => ({
  id: `m${String(n).padStart(4, '0')}`,
  senderId: n % 2 ? 'bob' : 'me',
  text: `message ${n}`,
  sentAt: new Date(T0 + n * 1000),
  ...extra,
});
/** A conversation of `count` messages, numbered from 1. */
const conversation = (count: number) => Array.from({ length: count }, (_, i) => msg(i + 1));

/** The live listener (the last one started) hears the newest 50 of the conversation. */
function hearNewest(fromCache = false) {
  const live = server.listeners.filter((l) => !l.stopped).at(-1)!;
  act(() => live.onWindow({ entries: server.all.slice(-50).reverse().map(entry), fromCache }));
}

function open(options: Partial<ChatThreadOptions> = {}) {
  return renderHook<ChatThread, ChatThreadOptions>((props) => useChatThread(props), {
    initialProps: { pairId: 'bob_me', to: 'bob', listen: true, ...options },
  });
}

const ids = (messages: { id: string }[]) => messages.map((m) => m.id);
const numbers = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => msg(from + i).id);

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  server.all = [];
  server.listeners = [];
  server.pageReads = [];
  server.gate = null;
  server.failPages = false;
  vi.mocked(sendMessage).mockImplementation(async (_to, _text, extras) => ({ conversationId: 'bob_me', id: extras?.clientId ?? 'x' }));
});
afterEach(() => {
  vi.clearAllMocks();
  forgetOutboxes();
});

describe('the history', () => {
  it('listens only once the conversation exists, and keeps the messages that slide out of the window', () => {
    server.all = conversation(60);
    const { result, rerender } = open({ listen: false });
    expect(server.listeners).toHaveLength(0);
    expect(result.current.ready).toBe(false);

    rerender({ pairId: 'bob_me', to: 'bob', listen: true });
    expect(server.listeners.map((l) => l.pairId)).toEqual(['bob_me']);
    hearNewest();
    expect(result.current.ready).toBe(true);
    expect(ids(result.current.messages)).toEqual(numbers(11, 60));
    expect(result.current.hasOlder).toBe(true);

    // Two new messages push the two oldest out of the window: they stay.
    server.all = conversation(62);
    hearNewest();
    expect(ids(result.current.messages)).toEqual(numbers(11, 62));
    expect(result.current.messages.every((m) => m.delivery === 'delivered' && m.key === m.id)).toBe(true);
  });

  it('reads older pages before the oldest message held, one at a time, until the beginning', async () => {
    server.all = conversation(120);
    const { result } = open();
    hearNewest();

    let release!: () => void;
    server.gate = new Promise<void>((r) => (release = r));
    act(() => result.current.loadOlder());
    expect(result.current.loadingOlder).toBe(true);
    await waitFor(() => expect(server.pageReads).toHaveLength(1));
    // A second call while a page is on its way reads nothing more.
    act(() => result.current.loadOlder());
    await act(async () => {});
    expect(server.pageReads).toEqual([{ id: msg(71).id, max: OLDER_PAGE }]);
    await act(async () => release());
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));
    expect(ids(result.current.messages)).toEqual(numbers(21, 120));
    expect(result.current.hasOlder).toBe(true);

    server.gate = null;
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.hasOlder).toBe(false));
    expect(ids(result.current.messages)).toEqual(numbers(1, 120));
    // At the beginning there is nothing more to read.
    act(() => result.current.loadOlder());
    expect(server.pageReads).toHaveLength(2);
  });

  it('says a page read failed, and reads it again when asked', async () => {
    server.all = conversation(80);
    const { result } = open();
    hearNewest();
    server.failPages = true;
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.olderError).toBe(true));
    expect(result.current.hasOlder).toBe(true);
    expect(result.current.messages).toHaveLength(50);

    server.failPages = false;
    act(() => result.current.loadOlder());
    await waitFor(() => expect(result.current.messages).toHaveLength(80));
    expect(result.current.olderError).toBe(false);
  });

  it('drops a page read for a history that has since started afresh', async () => {
    server.all = conversation(300);
    const { result } = open();
    // The listener heard an old stretch (it was away) …
    const live = server.listeners[0];
    act(() => live.onWindow({ entries: server.all.slice(100, 150).reverse().map(entry), fromCache: false }));
    let release!: () => void;
    server.gate = new Promise<void>((r) => (release = r));
    act(() => result.current.loadOlder());
    await waitFor(() => expect(server.pageReads).toEqual([{ id: msg(101).id, max: OLDER_PAGE }]));
    // … then the thread moved far on: nothing in common, it starts afresh from the new window.
    hearNewest();
    await act(async () => release());
    await waitFor(() => expect(result.current.loadingOlder).toBe(false));
    expect(ids(result.current.messages)).toEqual(numbers(251, 300));
  });

  it('pages back until a quoted message is held, and gives up at the beginning', async () => {
    server.all = conversation(400);
    const { result } = open();
    hearNewest();
    let found = false;
    await act(async () => {
      found = await result.current.ensureLoaded(msg(120).id);
    });
    expect(found).toBe(true);
    expect(result.current.find(msg(120).id)).toBeTruthy();
    expect(server.pageReads.map((r) => r.max)).toEqual([100, 100, 100]);

    await act(async () => {
      found = await result.current.ensureLoaded('not-here');
    });
    expect(found).toBe(false);
    expect(result.current.hasOlder).toBe(false);
  });

  it('forgets everything when the conversation is gone, and keeps it through an outage, listening again once back', () => {
    server.all = conversation(10);
    const { result } = open();
    hearNewest();
    expect(result.current.messages).toHaveLength(10);

    act(() => server.listeners[0].onError(Object.assign(new Error('offline'), { code: 'unavailable' })));
    expect(result.current.messages).toHaveLength(10);
    expect(result.current.error).toBeTruthy();
    act(() => void window.dispatchEvent(new Event('online')));
    expect(server.listeners).toHaveLength(2);
    expect(server.listeners[0].stopped).toBe(true);
    hearNewest();
    expect(result.current.error).toBeNull();

    act(() => server.listeners[1].onError(Object.assign(new Error('denied'), { code: 'permission-denied' })));
    expect(result.current.messages).toEqual([]);
    // Refused is not an outage: coming back doesn't listen again.
    act(() => void window.dispatchEvent(new Event('online')));
    expect(server.listeners).toHaveLength(2);
  });

  it('stops listening when the thread goes away, and opens another conversation afresh', () => {
    server.all = conversation(5);
    const { result, rerender, unmount } = open();
    hearNewest();
    rerender({ pairId: 'carol_me', to: 'carol', listen: true });
    expect(server.listeners[0].stopped).toBe(true);
    expect(server.listeners[1].pairId).toBe('carol_me');
    expect(result.current.messages).toEqual([]);
    unmount();
    expect(server.listeners[1].stopped).toBe(true);
  });
});

describe('sending', () => {
  it('shows a message at once and lets the next be written; the document takes its place under the same key', async () => {
    server.all = conversation(3);
    let answer!: () => void;
    vi.mocked(sendMessage).mockImplementationOnce(async (_to, _text, extras) => {
      await new Promise<void>((r) => (answer = r));
      return { conversationId: 'bob_me', id: extras!.clientId! };
    });
    const onSent = vi.fn();
    const { result } = open({ onSent });
    hearNewest();

    act(() => {
      expect(result.current.send({ text: '  first  ' })).toBe(true);
      expect(result.current.send({ text: 'second', cardRef: 'walk' })).toBe(true);
    });
    const [first, second] = result.current.messages.slice(-2);
    expect([first.text, first.delivery, second.text, second.delivery]).toEqual(['first', 'sending', 'second', 'sending']);
    expect(first.key).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(first.id).toBe(first.key);
    // One at a time, in the order written: the second waits for the first.
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendMessage).mock.calls[0]).toEqual(['bob', 'first', expect.objectContaining({ clientId: first.key })]);

    await act(async () => answer());
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
    expect(vi.mocked(sendMessage).mock.calls[1]).toEqual([
      'bob',
      'second',
      expect.objectContaining({ cardRef: 'walk', clientId: second.key }),
    ]);
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(result.current.messages.slice(-2).map((m) => m.delivery)).toEqual(['sent', 'sent']);

    // The listener hears the documents, which the server gave the client ids.
    server.all = [
      ...conversation(3),
      msg(4, { id: first.key, senderId: 'me', text: 'first' }),
      msg(5, { id: second.key, senderId: 'me', text: 'second', cardRef: 'walk' }),
    ];
    hearNewest();
    const drawn = result.current.messages;
    expect(drawn).toHaveLength(5);
    expect(drawn.slice(-2).map((m) => [m.key, m.delivery])).toEqual([
      [first.key, 'delivered'],
      [second.key, 'delivered'],
    ]);
  });

  it('keeps a failed message in the thread to retry under the same id, or to delete', async () => {
    server.all = conversation(2);
    const { result } = open();
    hearNewest();
    vi.mocked(sendMessage).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    act(() => void result.current.send({ text: 'lost' }));
    await waitFor(() => expect(result.current.messages.at(-1)!.delivery).toBe('failed'));
    const failed = result.current.messages.at(-1)!;

    act(() => result.current.retry(failed.key));
    await waitFor(() => expect(result.current.messages.at(-1)!.delivery).toBe('sent'));
    const ids = vi.mocked(sendMessage).mock.calls.map((c) => c[2]!.clientId);
    expect(ids).toEqual([failed.key, failed.key]);

    vi.mocked(sendMessage).mockRejectedValueOnce(Object.assign(new Error('blocked'), { status: 403 }));
    act(() => void result.current.send({ text: 'refused' }));
    await waitFor(() => expect(result.current.messages.at(-1)!.delivery).toBe('failed'));
    act(() => result.current.discard(result.current.messages.at(-1)!.key));
    expect(result.current.messages.map((m) => m.text)).toEqual(['message 1', 'message 2', 'lost']);
  });

  it('sends nothing empty, too long, or before it knows to whom', () => {
    const { result, rerender } = open();
    hearNewest();
    act(() => {
      expect(result.current.send({ text: '   ' })).toBe(false);
      expect(result.current.send({ text: 'x'.repeat(2001) })).toBe(false);
    });
    rerender({ pairId: undefined, to: undefined, listen: false });
    act(() => {
      expect(result.current.send({ text: 'hello' })).toBe(false);
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('keeps what is on its way when the thread is closed and opened again', async () => {
    server.all = conversation(2);
    vi.mocked(sendMessage).mockImplementationOnce(() => new Promise(() => {}));
    const first = open();
    hearNewest();
    act(() => void first.result.current.send({ text: 'still going' }));
    first.unmount();
    const again = open();
    hearNewest();
    expect(again.result.current.messages.at(-1)).toMatchObject({ text: 'still going', delivery: 'sending' });
  });
});

describe('replying', () => {
  it('answers a delivered message, sending its id and drawing its quote, then lets go of it', async () => {
    server.all = [msg(1, { text: 'a'.repeat(200) }), msg(2)];
    const { result } = open();
    hearNewest();
    act(() => result.current.reply(result.current.messages[0]));
    expect(result.current.replyingTo).toEqual({ id: msg(1).id, senderId: 'bob', text: 'a'.repeat(140) });

    act(() => void result.current.send({ text: 'yes' }));
    expect(result.current.replyingTo).toBeNull();
    expect(result.current.messages.at(-1)!.replyTo).toMatchObject({ id: msg(1).id });
    await waitFor(() => expect(sendMessage).toHaveBeenCalled());
    expect(vi.mocked(sendMessage).mock.calls[0][2]).toMatchObject({ replyTo: msg(1).id });
  });

  it('cannot answer a message still on its way', () => {
    const { result } = open();
    hearNewest();
    vi.mocked(sendMessage).mockImplementationOnce(() => new Promise(() => {}));
    act(() => void result.current.send({ text: 'pending' }));
    act(() => result.current.reply(result.current.messages.at(-1)!));
    expect(result.current.replyingTo).toBeNull();
    act(() => result.current.cancelReply());
    expect(result.current.replyingTo).toBeNull();
  });
});

describe('searching', () => {
  it('reads the whole conversation for a search, and finds older messages newest first', async () => {
    server.all = conversation(480).map((m, i) => (i % 100 === 7 ? { ...m, text: `Coffee at ${i}` } : m));
    const { result } = open();
    hearNewest();
    act(() => result.current.setSearchQuery('coffee'));
    expect(result.current.search.loading).toBe(true);
    await waitFor(() => expect(result.current.search.complete).toBe(true));
    expect(result.current.search.loading).toBe(false);
    expect(server.pageReads.every((r) => r.max === ALL_PAGE)).toBe(true);
    expect(result.current.search.hits.map((h) => h.messageId)).toEqual([408, 308, 208, 108, 8].map((n) => msg(n).id));
    expect(result.current.search.hits[0].ranges).toEqual([{ start: 0, end: 6 }]);
    expect(result.current.search.capped).toBe(false);

    // A new query searches what is held: nothing more to read.
    const reads = server.pageReads.length;
    act(() => result.current.setSearchQuery('at 7'));
    expect(result.current.search.hits.map((h) => h.messageId)).toEqual([msg(8).id]);
    expect(server.pageReads).toHaveLength(reads);
    act(() => result.current.setSearchQuery(''));
    expect(result.current.search.hits).toEqual([]);
  });

  it('stops reading at the cap and says there is more', async () => {
    server.all = conversation(LOAD_ALL_CAP + 400);
    const { result } = open();
    hearNewest();
    act(() => result.current.setSearchQuery('message'));
    await waitFor(() => expect(result.current.search.capped).toBe(true), { timeout: 5000 });
    expect(result.current.search.complete).toBe(false);
    expect(result.current.messages.length).toBeGreaterThanOrEqual(LOAD_ALL_CAP);
    expect(result.current.messages.length).toBeLessThan(LOAD_ALL_CAP + 400);
    expect(getOlderMessages).toHaveBeenCalledTimes(Math.ceil((LOAD_ALL_CAP - 50) / ALL_PAGE));
  });
});

describe('forgetting a deleted conversation', () => {
  it('lets go of its history and of what was still on its way', () => {
    server.all = conversation(3);
    vi.mocked(sendMessage).mockImplementationOnce(() => new Promise(() => {}));
    const { result } = open();
    hearNewest();
    act(() => void result.current.send({ text: 'on its way' }));
    expect(result.current.messages).toHaveLength(4);
    act(() => result.current.forget());
    expect(result.current.messages).toEqual([]);
  });
});
