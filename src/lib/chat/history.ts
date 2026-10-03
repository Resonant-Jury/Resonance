import type { Message } from '@/lib/db/types';

/** A message with the cursor that starts the page before it. */
export interface HistoryEntry<C> {
  message: Message;
  cursor: C;
}

/** What a live window changed. */
export type WindowMerge =
  | 'unchanged'
  | 'changed'
  /**
   * The window shared nothing with what was held (the listener was away long
   * enough for the thread to move on past it): the history started afresh
   * from it, and a page being read for the old one is void.
   */
  | 'restarted';

/** Oldest first: send time, then id. */
export function compareMessages(a: Message, b: Message): number {
  const dt = a.sentAt.getTime() - b.sentAt.getTime();
  if (dt !== 0) return dt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Every message of a conversation the thread has so far, oldest first (by
 * send time, then id) — the twin of the apps' MessageHistory.
 *
 * Two things feed it: the live window — the newest {@link LIVE_LIMIT}
 * messages, which a listener keeps current — and older pages read one at a
 * time. The window only ever adds to what is held: a message that slides out
 * of it (a newer one pushed it past the limit) stays, so the thread keeps
 * what the reader has scrolled through. `C` is whatever the next older page
 * starts after (the message's send time and id); the history only remembers
 * the one that belongs to its oldest message.
 *
 * Firestore orders by the send time to the microsecond, this by the
 * millisecond: two messages within one millisecond may hold their places
 * differently here, which at worst reads a message of the next page again —
 * nothing is ever skipped.
 */
export class MessageHistory<C> {
  static readonly LIVE_LIMIT = 50;

  private readonly byId = new Map<string, Message>();
  private oldest: Message | null = null;
  /** Whether an older page has been read since the history last started afresh. */
  private paged = false;

  /** All messages held, oldest first. A new array whenever something changed. */
  messages: readonly Message[] = [];
  /** Where the page before the oldest message held starts; null while the history is empty. */
  oldestCursor: C | null = null;
  /**
   * Whether there may be messages older than the oldest held. True while that
   * isn't known (only a cached window has arrived); false once a window
   * shorter than the limit came from the server (it holds the whole
   * conversation) or a page came back short.
   */
  hasOlder = false;

  constructor(private readonly liveLimit = MessageHistory.LIVE_LIMIT) {}

  get size(): number {
    return this.byId.size;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  get(id: string): Message | undefined {
    return this.byId.get(id);
  }

  /**
   * The live window arrived (in any order). `authoritative`: it came from the
   * server, so a window shorter than the limit is the whole conversation; one
   * from the listener's cache may be only a part of it.
   */
  mergeWindow(window: readonly HistoryEntry<C>[], authoritative = true): WindowMerge {
    let restarted = false;
    if (this.byId.size > 0 && !window.some((e) => this.byId.has(e.message.id))) {
      this.clear();
      restarted = true;
    }
    const changed = this.upsert(window);
    if (!this.paged) this.hasOlder = window.length >= this.liveLimit || !authoritative;
    return restarted ? 'restarted' : changed ? 'changed' : 'unchanged';
  }

  /** An older page of at most `limit` messages arrived: a shorter one was the last. Returns whether anything new came in. */
  mergePage(page: readonly HistoryEntry<C>[], limit: number): boolean {
    this.paged = true;
    this.hasOlder = page.length >= limit;
    return this.upsert(page);
  }

  /** Forgets everything (the conversation is gone, or the listener lost track of it). */
  clear(): void {
    this.byId.clear();
    this.messages = [];
    this.oldest = null;
    this.oldestCursor = null;
    this.hasOlder = false;
    this.paged = false;
  }

  private upsert(entries: readonly HistoryEntry<C>[]): boolean {
    let changed = false;
    for (const { message, cursor } of entries) {
      if (!sameMessage(this.byId.get(message.id), message)) {
        this.byId.set(message.id, message);
        changed = true;
      }
      const current = this.oldest;
      // The oldest message's cursor is refreshed when its document comes again (an updated snapshot).
      if (!current || current.id === message.id || compareMessages(message, current) < 0) {
        this.oldest = this.byId.get(message.id)!;
        this.oldestCursor = cursor;
      }
    }
    if (changed) this.messages = [...this.byId.values()].sort(compareMessages);
    return changed;
  }
}

/**
 * Whether a snapshot of a message says nothing new: the listener hands over a
 * fresh object for every document of every window, and keeping the one held
 * keeps the rows drawn for it from drawing again.
 */
function sameMessage(held: Message | undefined, next: Message): boolean {
  if (!held) return false;
  if (held === next) return true;
  return (
    held.senderId === next.senderId &&
    held.text === next.text &&
    held.sentAt.getTime() === next.sentAt.getTime() &&
    held.cardRef === next.cardRef &&
    JSON.stringify(held.noteRef ?? null) === JSON.stringify(next.noteRef ?? null) &&
    JSON.stringify(held.replyTo ?? null) === JSON.stringify(next.replyTo ?? null) &&
    JSON.stringify(held.preview ?? null) === JSON.stringify(next.preview ?? null)
  );
}
