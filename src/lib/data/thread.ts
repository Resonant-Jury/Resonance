'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { MessageHistory } from '@/lib/chat/history';
import { canReply, quoteOf, type ChatMessage } from '@/lib/chat/message';
import { Outbox, isShown, newClientId, type Outgoing } from '@/lib/chat/outbox';
import { searchMessages, type SearchHit } from '@/lib/chat/search';
import { ThreadMessages } from '@/lib/chat/threadMessages';
import { isAbsent } from '@/lib/db/firestore/client/errors';
import {
  MESSAGE_MAX_LENGTH,
  getOlderMessages,
  listenThread,
  sendMessage,
  type MessageCursor,
} from '@/lib/db/firestore/client/messages';
import type { MessageReplyQuote } from '@/lib/db/types';

/** The page {@link ChatThread.loadOlder} reads. */
export const OLDER_PAGE = 50;
/** The page {@link ChatThread.ensureLoaded} reads while it looks for a message. */
export const JUMP_PAGE = 100;
/** The page a search reads the whole history in. */
export const ALL_PAGE = 200;
/** How far back a search reads at most. */
export const LOAD_ALL_CAP = 5000;

// --- Outboxes ---------------------------------------------------------------

/**
 * Each conversation's outbox, for as long as the page lives: a message on its
 * way keeps going (and a failed one stays to retry) while the reader opens
 * another conversation and comes back. Kept per viewer: another account
 * signing in on this tab (here, or in another tab — the sign-in is shared)
 * sees none of them, and what one account queued never goes out as the next
 * (each message is sent only while its writer is the one signed in).
 */
const outboxes = new Map<string, Outbox>();

/** The outbox of the viewer `uid`'s conversation `pairId` with `to`, made on first use. */
export function outboxOf(uid: string, pairId: string, to: string): Outbox {
  // Another account's turn: what the one before left on its way is let go of.
  for (const [key, box] of outboxes) {
    if (key.startsWith(`${uid}:`)) continue;
    box.clear();
    outboxes.delete(key);
  }
  const key = `${uid}:${pairId}`;
  let box = outboxes.get(key);
  if (!box) {
    box = new Outbox(
      async (m) =>
        (
          await sendMessage(to, m.text, {
            cardRef: m.cardRef,
            noteRef: m.noteRef,
            replyTo: m.replyTo?.id,
            clientId: m.clientId,
            as: uid,
          })
        ).id,
    );
    outboxes.set(key, box);
  }
  return box;
}

/** Forgets every outbox (and what is still on its way in them): the viewer signed out, or a test starts afresh. */
export function forgetOutboxes(): void {
  for (const box of outboxes.values()) box.clear();
  outboxes.clear();
}

// --- History ----------------------------------------------------------------

interface HistoryState {
  /** The first window of messages has arrived (or the listener failed). */
  ready: boolean;
  /** The listener failed; a refusal (`permission-denied`) means the conversation is gone. */
  error: Error | null;
  hasOlder: boolean;
  loadingOlder: boolean;
  olderError: boolean;
  /** The whole-history read for a search stopped at the cap with more before it. */
  capped: boolean;
  /** Bumped whenever the history's messages change. */
  version: number;
}

const NO_HISTORY: HistoryState = {
  ready: false,
  error: null,
  hasOlder: false,
  loadingOlder: false,
  olderError: false,
  capped: false,
  version: 0,
};

/**
 * One conversation's history as the open thread holds it: the newest
 * messages live, older ones paged in, every page read one after another, a
 * page read for a history that has since started afresh thrown away. Its
 * state is a snapshot for useSyncExternalStore.
 */
class ThreadHistory {
  readonly history = new MessageHistory<MessageCursor>();
  readonly thread = new ThreadMessages();
  state: HistoryState = NO_HISTORY;

  private readonly readers = new Set<() => void>();
  /** Which listener callbacks count (a late one of a stopped listener doesn't). */
  private listening = 0;
  private stopListener: (() => void) | null = null;
  /** Which life of the history a page read belongs to. */
  private epoch = 0;
  private paging: Promise<void> = Promise.resolve();
  private pages = 0;
  private allRequested = false;

  constructor(readonly pairId: string) {}

  subscribe = (reader: () => void): (() => void) => {
    this.readers.add(reader);
    return () => this.readers.delete(reader);
  };

  getState = (): HistoryState => this.state;

  /** Listens to the newest messages; returns the stop. */
  listen(): () => void {
    this.stopListening();
    const run = ++this.listening;
    this.stopListener = listenThread(
      this.pairId,
      (window) => {
        if (run !== this.listening) return;
        // The newest join what is held; the ones that slid out of the window stay.
        const merged = this.history.mergeWindow(window.entries, !window.fromCache);
        if (merged === 'restarted') this.forgetPaging();
        this.update({ ready: true, error: null }, merged !== 'unchanged');
      },
      (error) => {
        if (run !== this.listening) return;
        // Refused: the conversation was deleted (or isn't there yet) — nothing of it is left to show.
        // Anything else (offline for good) keeps what was read; restartIfFailed listens again.
        if (isAbsent(error)) this.reset();
        this.update({ ready: true, error }, isAbsent(error));
      },
    );
    return () => this.stopListening();
  }

  /** Back in the tab or back online: a listener that failed for a reason that passes listens again. */
  restartIfFailed(): void {
    const { error } = this.state;
    if (!error || isAbsent(error) || !this.stopListener) return;
    this.listen();
  }

  private stopListening(): void {
    this.listening++;
    this.stopListener?.();
    this.stopListener = null;
  }

  /** Everything held is forgotten (the conversation is gone). */
  reset(): void {
    this.history.clear();
    this.thread.clear();
    this.forgetPaging();
    this.update({}, true);
  }

  /** Pages being read belong to a history that is no more: their answers are dropped. */
  private forgetPaging(): void {
    this.epoch++;
    this.allRequested = false;
    this.state = { ...this.state, olderError: false, capped: false };
  }

  loadOlder(): void {
    if (!this.history.hasOlder || this.pages > 0) return;
    void this.page(() => this.fetchOlder(OLDER_PAGE));
  }

  async ensureLoaded(id: string, maxPages: number): Promise<boolean> {
    // A read that failed before is tried again: the reader asked for this one.
    if (this.state.olderError) this.update({ olderError: false });
    let read = 0;
    while (!this.history.has(id)) {
      if (!this.history.hasOlder || read++ >= maxPages) return false;
      await (this.pages > 0 ? this.paging : this.page(() => this.fetchOlder(JUMP_PAGE)));
      if (this.state.olderError) return false;
    }
    return true;
  }

  loadAll(cap: number): void {
    if (this.allRequested) return;
    this.allRequested = true;
    void this.page(async () => {
      let ok = true;
      while (ok && this.history.hasOlder && this.history.size < cap) ok = await this.fetchOlder(ALL_PAGE);
      const capped = this.history.hasOlder && this.history.size >= cap;
      // Done only once it reached the beginning or the cap: a read that failed, or one with no window to page
      // back from yet, is asked again as the history changes or by the next search.
      this.allRequested = !this.state.olderError && (!this.history.hasOlder || capped) && this.history.size > 0;
      this.update({ capped });
    });
  }

  /** One paging read at a time: `work` runs after the one before it. */
  private page(work: () => Promise<unknown>): Promise<void> {
    this.pages++;
    if (this.pages === 1) this.update({ loadingOlder: true });
    const run = this.paging.then(work).then(
      () => undefined,
      () => undefined,
    );
    this.paging = run.then(() => {
      this.pages--;
      if (this.pages === 0) this.update({ loadingOlder: false });
    });
    return this.paging;
  }

  /** One older page into the history; whether it brought a page in. */
  private async fetchOlder(limit: number): Promise<boolean> {
    const cursor = this.history.oldestCursor;
    if (!cursor) return false;
    const life = this.epoch;
    if (this.state.olderError) this.update({ olderError: false });
    try {
      const page = await getOlderMessages(this.pairId, cursor, limit);
      if (life !== this.epoch) return false;
      const changed = this.history.mergePage(page, limit);
      this.update({}, changed);
      return true;
    } catch {
      if (life === this.epoch) this.update({ olderError: true });
      return false;
    }
  }

  private update(change: Partial<HistoryState>, messagesChanged = false): void {
    this.state = {
      ...this.state,
      ...change,
      hasOlder: this.history.hasOlder,
      version: messagesChanged ? this.state.version + 1 : this.state.version,
    };
    this.readers.forEach((reader) => reader());
  }
}

const noSubscribe = () => () => {};
const noState = () => NO_HISTORY;
const NO_OUTGOING: readonly Outgoing[] = [];
const noOutgoing = () => NO_OUTGOING;

// --- The hook ---------------------------------------------------------------

export interface ChatThreadOptions {
  /** The conversation (the sorted pair of uids); undefined until both people are known. */
  pairId: string | undefined;
  /** The other person's uid: whom the messages go to. */
  to: string | undefined;
  /**
   * Whether the conversation exists, so there is something to listen to (its
   * messages' read rule reads the conversation: listening before it exists
   * would only be refused). A first message makes it.
   */
  listen: boolean;
  /** The server took a message — the first one opened the conversation, which is then there to listen to. */
  onSent?: () => void;
}

/** In-thread search over the whole conversation. */
export interface ThreadSearch {
  /** What is being searched for; blank when not searching. */
  query: string;
  /** The messages that match, newest first, each with the stretches of its text to mark. */
  hits: SearchHit[];
  /** Every message of the conversation is held, so the hits are all there are. */
  complete: boolean;
  /** The history was read as far back as a search reads ({@link LOAD_ALL_CAP}) and there is more. */
  capped: boolean;
  /** Older messages are being read for the search: the hits may still grow. */
  loading: boolean;
}

/** What the composer hands over to send. */
export interface ThreadDraft {
  text: string;
  cardRef?: string;
  noteRef?: { cardId: string; noteId: string };
}

/**
 * One open conversation, the web twin of the apps' ThreadModel: its messages
 * (`messages`, oldest first — the history, then the viewer's own still on
 * their way), paging back through older ones, sending without waiting,
 * replying, and searching the whole history.
 */
export interface ChatThread {
  messages: ChatMessage[];
  /** The first window of messages arrived (or the listener failed). */
  ready: boolean;
  /** The listener failed; what was read stays (a refusal clears it: the conversation is gone). */
  error: Error | null;

  /** There may be messages older than the oldest held. False at the beginning of the conversation. */
  hasOlder: boolean;
  /** A page of older messages (or the whole history, for a search) is being read. */
  loadingOlder: boolean;
  /** The last read of older messages failed; {@link loadOlder} tries again. */
  olderError: boolean;
  /** Reads the next page of older messages; nothing at the beginning or while one is being read. Prepends: nothing held moves. */
  loadOlder(): void;
  /**
   * Reads older pages until the message `id` is held (at most `maxPages` of
   * {@link JUMP_PAGE}): whether it is — false when it isn't in this
   * conversation, the beginning came first or a read failed.
   */
  ensureLoaded(id: string, maxPages?: number): Promise<boolean>;

  /**
   * Sends what the composer held (and the message being replied to, which it
   * clears) without waiting: the message shows at once as sending, the next
   * can be written meanwhile. False when there is nothing to send (no text or
   * card, too long, nobody to send to).
   */
  send(draft: ThreadDraft): boolean;
  /** Sends a failed message again (by key or id), after the ones written before it that failed with it. */
  retry(keyOrId: string): void;
  /** Sends every failed message again, in the order they were written. */
  retryAll(): void;
  /** Deletes a failed message (by key or id); one still sending can't be taken back. */
  discard(keyOrId: string): void;

  /** The message the next one answers. */
  replyingTo: MessageReplyQuote | null;
  /** The next message answers `message` — only a delivered one can be answered. */
  reply(message: ChatMessage): void;
  cancelReply(): void;

  search: ThreadSearch;
  /** Searches for `query` (and reads the whole history for it once); a blank query ends the search. */
  setSearchQuery(query: string): void;

  /** The message with this id or key, if the thread holds it. */
  find(idOrKey: string): ChatMessage | undefined;
  /** The conversation was deleted from here: its history and what was still on its way go. */
  forget(): void;
}

/**
 * One open conversation (see {@link ChatThread}). The history lives as long
 * as the thread is on screen; what the viewer sent lives in the
 * conversation's outbox, which outlives it ({@link outboxOf}).
 */
export function useChatThread({ pairId, to, listen, onSent }: ChatThreadOptions): ChatThread {
  const { user, loading } = useAuth();
  const uid = user && !loading ? user.id : null;

  const store = useMemo(() => (pairId && uid ? new ThreadHistory(pairId) : null), [pairId, uid]);
  const state = useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getState ?? noState, noState);
  const box = useMemo(() => (pairId && uid && to ? outboxOf(uid, pairId, to) : null), [pairId, uid, to]);
  const outgoing = useSyncExternalStore(box?.subscribe ?? noSubscribe, box?.getEntries ?? noOutgoing, noOutgoing);

  // Listen once the conversation exists; a listener that failed for a passing reason listens again when the
  // reader comes back to the tab or back online.
  useEffect(() => {
    if (!store || !listen) return;
    const stop = store.listen();
    const again = () => {
      if (document.visibilityState !== 'hidden') store.restartIfFailed();
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('online', again);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('online', again);
    };
  }, [store, listen]);

  const messages = useMemo(
    () => (store ? store.thread.build(store.history, outgoing) : []),
    // `state.version` stands for the history's messages, which change in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, state.version, outgoing],
  );

  // A message whose document has arrived leaves the outbox (it is drawn from the history now).
  useEffect(() => {
    if (store && box) box.reconcile((m) => isShown(m, store.history));
  }, [store, box, state.version, outgoing]);

  // Tell the page once for each message the server took.
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;
  const told = useRef(new Set<string>());
  useEffect(() => {
    let any = false;
    for (const m of outgoing) {
      if (m.status === 'sent' && !told.current.has(m.clientId)) {
        told.current.add(m.clientId);
        any = true;
      }
    }
    if (any) onSentRef.current?.();
  }, [outgoing]);

  const [replyingTo, setReplyingTo] = useState<MessageReplyQuote | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    setReplyingTo(null);
    setQuery('');
  }, [pairId]);

  // A search reads the whole history (once a visit, as far as the cap); its hits grow as pages come in.
  const searching = query.trim().length > 0;
  useEffect(() => {
    if (store && searching) store.loadAll(LOAD_ALL_CAP);
  }, [store, searching, state.version]);
  const hits = useMemo(
    () => (store && searching ? searchMessages(store.history.messages, query) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, searching, query, state.version],
  );

  // The actions stay the same functions while the conversation does, so rows drawn with them needn't draw again.
  const replyingToRef = useRef(replyingTo);
  replyingToRef.current = replyingTo;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const actions = useMemo(() => {
    const clientIdOf = (keyOrId: string) =>
      box?.entries.find((m) => m.clientId === keyOrId || m.serverId === keyOrId)?.clientId;
    return {
      loadOlder: () => store?.loadOlder(),
      ensureLoaded: (id: string, maxPages = 20) => (store ? store.ensureLoaded(id, maxPages) : Promise.resolve(false)),
      send: (draft: ThreadDraft) => {
        if (!box || !uid) return false;
        const text = draft.text.trim();
        if ((!text && !draft.cardRef) || text.length > MESSAGE_MAX_LENGTH) return false;
        const replyTo = replyingToRef.current;
        box.enqueue({
          clientId: newClientId(),
          senderId: uid,
          text,
          ...(draft.cardRef ? { cardRef: draft.cardRef } : {}),
          ...(draft.noteRef ? { noteRef: draft.noteRef } : {}),
          ...(replyTo ? { replyTo } : {}),
          queuedAt: new Date(),
        });
        replyingToRef.current = null;
        setReplyingTo(null);
        return true;
      },
      retry: (keyOrId: string) => {
        const id = clientIdOf(keyOrId);
        if (id) box?.retry(id);
      },
      retryAll: () => box?.retryFailed(),
      discard: (keyOrId: string) => {
        const id = clientIdOf(keyOrId);
        if (id) box?.discard(id);
      },
      reply: (message: ChatMessage) => {
        if (canReply(message)) setReplyingTo(quoteOf(message));
      },
      cancelReply: () => setReplyingTo(null),
      setSearchQuery: setQuery,
      find: (idOrKey: string) => messagesRef.current.find((m) => m.id === idOrKey || m.key === idOrKey),
      forget: () => {
        if (uid && pairId) {
          outboxes.get(`${uid}:${pairId}`)?.clear();
          outboxes.delete(`${uid}:${pairId}`);
        }
        store?.reset();
      },
    };
  }, [store, box, uid, pairId]);

  return {
    ...actions,
    messages,
    ready: state.ready,
    error: state.error,
    hasOlder: state.hasOlder,
    loadingOlder: state.loadingOlder,
    olderError: state.olderError,
    replyingTo,
    search: {
      query,
      hits,
      complete: !state.hasOlder,
      capped: state.capped,
      loading: searching && state.loadingOlder,
    },
  };
}
