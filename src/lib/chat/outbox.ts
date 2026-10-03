import type { Message, MessageReplyQuote } from '@/lib/db/types';
import type { ChatMessage } from './message';

export type OutgoingStatus = 'queued' | 'sending' | 'sent' | 'failed';

/** A message from the viewer: what the composer held when they sent it. */
export interface Outgoing {
  /** Made here before sending; the server makes it the message's document id. */
  clientId: string;
  senderId: string;
  text: string;
  cardRef?: string;
  noteRef?: { cardId: string; noteId: string };
  /** The message it answers; the server makes its own snapshot of it. */
  replyTo?: MessageReplyQuote;
  queuedAt: Date;
  status: OutgoingStatus;
  /** The document id the server answered with (once `sent`): the client id, from a server that uses it. */
  serverId?: string;
  /** `failed` because the server said no to this message itself, not because the line stopped. */
  refused?: boolean;
}

/** What the composer hands the outbox; the outbox keeps the rest. */
export type OutgoingDraft = Omit<Outgoing, 'status' | 'serverId' | 'refused'>;

/** Sends one message; resolves to the document id the server gave it, rejects on failure. */
export type Deliver = (message: Outgoing) => Promise<string>;

/**
 * A conversation's messages on their way out, so that sending never holds
 * the composer — the twin of the apps' Outbox. A message is queued the moment
 * it is written and the field is free again; one worker sends the queue in
 * order, one at a time, each under its own client id (which the server makes
 * the message's document id, so sending it again after a lost answer finds
 * the message instead of writing a second one).
 *
 * A message is `queued`, `sending` (in flight), `sent` (the server took it —
 * it stays until the conversation's listener shows the document, see
 * {@link reconcile}) or `failed`. A failure that the network or the server's
 * trouble caused (offline, a timeout, a 5xx, too many requests) stops the
 * line: everything queued behind it fails with it, so nothing overtakes it;
 * {@link retry} of one of them sends it after the ones written before it that
 * stopped with it, and {@link retryFailed} puts them all back in their order.
 * A refusal of the message itself (a 4xx: blocked, no such message to reply
 * to) fails only that message — the others don't depend on it, nor does its
 * retry depend on them.
 *
 * It belongs to the conversation, not to the thread on screen (see
 * lib/data/thread's outboxes), so a send carries on while the reader opens
 * another conversation, and a failure is still there to retry when they
 * come back.
 */
export class Outbox {
  /** Every message the conversation doesn't show yet, in the order they were written. */
  entries: readonly Outgoing[] = [];

  private readonly listeners = new Set<() => void>();
  private running = false;
  /** Which life of the outbox a send belongs to: {@link clear} makes a send in flight void. */
  private life = 0;

  constructor(
    private readonly deliver: Deliver,
    private readonly isRefusal: (error: unknown) => boolean = refusedByServer,
  ) {}

  /** For useSyncExternalStore: called whenever {@link entries} changes. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** For useSyncExternalStore: the same array until something changed. */
  getEntries = (): readonly Outgoing[] => this.entries;

  /**
   * Queues `message` and starts sending if no send is under way. Messages that
   * failed with the line (offline, a server hiccup — not refused on their own
   * account) go back in the queue ahead of it: writing again is the moment to
   * try, and a new message must never reach the other person before the ones
   * written earlier.
   */
  enqueue(message: OutgoingDraft): void {
    this.set([
      ...this.entries.map((e) => (e.status === 'failed' && !e.refused ? { ...e, status: 'queued' as const } : e)),
      { ...message, status: 'queued' },
    ]);
    this.wake();
  }

  /** Puts every failed message back in the queue, in the order they were written. */
  retryFailed(): void {
    this.requeue(() => true);
  }

  /**
   * Sends the failed message `clientId` again, under the id it was written
   * under. The ones written before it that failed with the line (not on their
   * own account) go first, so a retry never overtakes a message the reader
   * wrote earlier; the ones written after it wait for their own retry.
   */
  retry(clientId: string): void {
    const at = this.entries.findIndex((e) => e.clientId === clientId && e.status === 'failed');
    if (at < 0) return;
    const ahead = new Set(this.entries.slice(0, at).map((e) => e.clientId));
    this.requeue((e) => (ahead.has(e.clientId) && !e.refused) || e.clientId === clientId);
  }

  /** Drops a message that failed (the reader chose to delete it). A message still sending can't be taken back. */
  discard(clientId: string): void {
    const left = this.entries.filter((e) => !(e.clientId === clientId && e.status === 'failed'));
    if (left.length !== this.entries.length) this.set(left);
  }

  /**
   * Forgets the messages the conversation now shows: their document replaced
   * them. Any status — a message whose answer was lost can have arrived all
   * the same.
   */
  reconcile(shown: (message: Outgoing) => boolean): void {
    const left = this.entries.filter((e) => !shown(e));
    if (left.length !== this.entries.length) this.set(left);
  }

  /** Everything goes: the conversation was deleted. A send in flight finishes unheard. */
  clear(): void {
    this.life++;
    this.running = false;
    if (this.entries.length) this.set([]);
  }

  private requeue(which: (message: Outgoing) => boolean): void {
    if (!this.entries.some((e) => e.status === 'failed' && which(e))) return;
    this.set(
      this.entries.map((e) => (e.status === 'failed' && which(e) ? { ...e, status: 'queued' as const, refused: false } : e)),
    );
    this.wake();
  }

  private wake(): void {
    if (this.running) return;
    this.running = true;
    void this.drain(this.life);
  }

  private async drain(life: number): Promise<void> {
    while (life === this.life) {
      const next = this.entries.find((e) => e.status === 'queued');
      if (!next) {
        // Said here, not after the loop's promise settles: a message queued in between would wait for nobody.
        this.running = false;
        return;
      }
      this.update(next.clientId, (e) => ({ ...e, status: 'sending' }));
      try {
        const id = await this.deliver({ ...next, status: 'sending' });
        if (life !== this.life) return;
        this.update(next.clientId, (e) => ({ ...e, status: 'sent', serverId: id }));
      } catch (error) {
        if (life !== this.life) return;
        if (this.isRefusal(error)) this.update(next.clientId, (e) => ({ ...e, status: 'failed', refused: true }));
        else this.stopTheLine(next.clientId);
      }
    }
  }

  /** `from` failed for a reason that will pass: it and everything queued behind it fail, so the order holds on retry. */
  private stopTheLine(from: string): void {
    let behind = false;
    this.set(
      this.entries.map((e) => {
        if (e.clientId === from) behind = true;
        return behind && (e.status === 'queued' || e.status === 'sending') ? { ...e, status: 'failed' as const } : e;
      }),
    );
  }

  /** A message may have left meanwhile (reconciled): then this changes nothing. */
  private update(clientId: string, change: (message: Outgoing) => Outgoing): void {
    if (!this.entries.some((e) => e.clientId === clientId)) return;
    this.set(this.entries.map((e) => (e.clientId === clientId ? change(e) : e)));
  }

  private set(entries: readonly Outgoing[]): void {
    this.entries = entries;
    this.listeners.forEach((listener) => listener());
  }
}

/** Whether the conversation's own document of this message is among `held` (ids of the history). */
export function isShown(message: Outgoing, held: { has(id: string): boolean }): boolean {
  return held.has(message.clientId) || (!!message.serverId && held.has(message.serverId));
}

const toDelivery = { queued: 'sending', sending: 'sending', sent: 'sent', failed: 'failed' } as const;

/** The message as the thread draws it while it is on its way. */
export function outgoingMessage(message: Outgoing): ChatMessage {
  const drawn: Message = {
    id: message.clientId,
    senderId: message.senderId,
    text: message.text,
    sentAt: message.queuedAt,
    ...(message.cardRef ? { cardRef: message.cardRef } : {}),
    ...(message.noteRef ? { noteRef: message.noteRef } : {}),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
  };
  return { ...drawn, key: message.clientId, delivery: toDelivery[message.status] };
}

/**
 * The server answered and said no to this message itself (a 4xx other than
 * "signed out", "timed out" and "too many"), as opposed to a failure that
 * will pass. Read off the error's `status` (an ApiError from callApi).
 */
export function refusedByServer(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return false;
  return status >= 400 && status <= 499 && status !== 401 && status !== 408 && status !== 429;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A client id: 20 characters of [A-Za-z0-9] (the contract takes 16–64 of `[A-Za-z0-9_-]`). */
export function newClientId(): string {
  let id = '';
  while (id.length < 20) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    // 248 = 4 × 62: a byte past it would favour the first letters.
    for (const b of bytes) if (b < 248 && id.length < 20) id += ALPHABET[b % ALPHABET.length];
  }
  return id;
}
