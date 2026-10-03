import { describe, it, expect, vi } from 'vitest';
import { Outbox, newClientId, outgoingMessage, refusedByServer, type Outgoing, type OutgoingDraft } from './outbox';

/**
 * Sending never holds the composer: messages queue at once and go out in
 * order, one at a time, under client ids that make a resend harmless; a
 * failure keeps its place and its id for the retry.
 */
const out = (text: string, extra: Partial<OutgoingDraft> = {}): OutgoingDraft => ({
  clientId: `id-${text}`,
  senderId: 'alice',
  text,
  queuedAt: new Date(1_000),
  ...extra,
});

/** An ApiError as callApi throws it (only its status matters). */
const apiError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const offline = () => new TypeError('Failed to fetch');

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open };
}

const statuses = (box: Outbox) => box.entries.map((e) => e.status);
const until = (check: () => void) => vi.waitFor(check, { timeout: 2_000, interval: 1 });

describe('Outbox', () => {
  it('sends in order, one at a time, while more are written behind', async () => {
    const gates = { a: gate(), b: gate(), c: gate() };
    const sent: string[] = [];
    let inFlight = 0;
    let most = 0;
    const box = new Outbox(async (m) => {
      most = Math.max(most, ++inFlight);
      await gates[m.text as 'a' | 'b' | 'c'].promise;
      sent.push(m.clientId);
      inFlight--;
      return `doc-${m.text}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    box.enqueue(out('c'));
    expect(statuses(box)).toEqual(['sending', 'queued', 'queued']);

    gates.a.open();
    await until(() => expect(statuses(box)).toEqual(['sent', 'sending', 'queued']));
    gates.b.open();
    gates.c.open();
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent', 'sent']));
    expect(sent).toEqual(['id-a', 'id-b', 'id-c']);
    expect(most).toBe(1);
    expect(box.entries.map((e) => e.serverId)).toEqual(['doc-a', 'doc-b', 'doc-c']);
  });

  it('tells its readers each change, and hands back the same entries until one', async () => {
    const box = new Outbox(async () => 'doc');
    const heard = vi.fn();
    const stop = box.subscribe(heard);
    const before = box.getEntries();
    expect(box.getEntries()).toBe(before);
    box.enqueue(out('a'));
    expect(heard).toHaveBeenCalled();
    expect(box.getEntries()).not.toBe(before);
    await until(() => expect(statuses(box)).toEqual(['sent']));
    stop();
    heard.mockClear();
    box.reconcile(() => true);
    expect(heard).not.toHaveBeenCalled();
  });

  it('keeps a sent message until the conversation shows it', async () => {
    const box = new Outbox(async () => 'doc');
    box.enqueue(out('a'));
    await until(() => expect(statuses(box)).toEqual(['sent']));
    // The server answered; the document hasn't reached the listener yet.
    box.reconcile((m) => m.serverId === 'other');
    expect(box.entries).toHaveLength(1);
    box.reconcile((m) => m.serverId === 'doc');
    expect(box.entries).toEqual([]);
  });

  it('sends what the composer held, and draws it as a message that cannot be answered yet', async () => {
    const seen: Outgoing[] = [];
    const box = new Outbox(async (m) => {
      seen.push(m);
      return 'd';
    });
    const replyTo = { id: 'm0', senderId: 'bob', text: 'shall we?' };
    box.enqueue(out('a', { cardRef: 'walk', replyTo, noteRef: { cardId: 'c', noteId: 'n' } }));
    await until(() => expect(statuses(box)).toEqual(['sent']));
    expect(seen[0]).toMatchObject({ cardRef: 'walk', replyTo, noteRef: { cardId: 'c', noteId: 'n' } });

    const drawn = outgoingMessage(box.entries[0]);
    expect(drawn).toMatchObject({ id: 'id-a', key: 'id-a', delivery: 'sent', replyTo, cardRef: 'walk', text: 'a' });
    expect(outgoingMessage({ ...box.entries[0], status: 'queued' }).delivery).toBe('sending');
  });

  it('stops the line on a failure that will pass, and a retry keeps the order and the ids', async () => {
    let down = true;
    const tries: string[] = [];
    const box = new Outbox(async (m) => {
      tries.push(m.clientId);
      if (down) throw offline();
      return `doc-${m.clientId}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed']));
    // The second never tried to overtake the first.
    expect(tries).toEqual(['id-a']);

    // Another written while offline puts the stopped line back first: the first is tried again, never the new one ahead of it.
    box.enqueue(out('c'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed', 'failed']));
    expect(tries).toEqual(['id-a', 'id-a']);

    down = false;
    tries.length = 0;
    box.retryFailed();
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent', 'sent']));
    // Back in the order they were written, with the ids they were written under.
    expect(tries).toEqual(['id-a', 'id-b', 'id-c']);
    expect(box.entries.map((e) => e.serverId)).toEqual(['doc-id-a', 'doc-id-b', 'doc-id-c']);
  });

  it('sends the stopped line first when the viewer simply writes on', async () => {
    let down = true;
    const tries: string[] = [];
    const box = new Outbox(async (m) => {
      tries.push(m.clientId);
      if (down) throw apiError(503);
      return `doc-${m.clientId}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed']));

    down = false;
    tries.length = 0;
    box.enqueue(out('c'));
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent', 'sent']));
    expect(tries).toEqual(['id-a', 'id-b', 'id-c']);
  });

  it('retries one message after the ones that stopped before it, and leaves the later ones alone', async () => {
    let down = true;
    const tries: string[] = [];
    const box = new Outbox(async (m) => {
      tries.push(m.clientId);
      if (down) throw offline();
      return `doc-${m.clientId}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    box.enqueue(out('c'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed', 'failed']));
    down = false;
    tries.length = 0;

    // "b" can't overtake "a", which the same outage stopped; "c" waits for its own retry.
    box.retry('id-b');
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent', 'failed']));
    expect(tries).toEqual(['id-a', 'id-b']);

    box.retry('id-c');
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent', 'sent']));
    expect(tries).toEqual(['id-a', 'id-b', 'id-c']);
  });

  it('retries only a failed message', async () => {
    let down = true;
    const box = new Outbox(async (m) => {
      if (down) throw offline();
      return `doc-${m.clientId}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed']));
    down = false;
    box.retry('id-a');
    await until(() => expect(statuses(box)).toEqual(['sent', 'failed']));
    // This one is on its way already, that one isn't here.
    box.retry('id-a');
    box.retry('nobody');
    expect(statuses(box)).toEqual(['sent', 'failed']);
  });

  it('fails only a message the server refused, and does not send it along with a later retry', async () => {
    let refuse = true;
    const tries: string[] = [];
    const box = new Outbox(async (m) => {
      tries.push(m.clientId);
      if (m.text === 'bad' && refuse) throw apiError(403);
      if (m.text === 'b' && refuse) throw offline();
      return `doc-${m.clientId}`;
    });
    box.enqueue(out('bad'));
    box.enqueue(out('b'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'failed']));
    expect(box.entries[0].refused).toBe(true);
    refuse = false;
    tries.length = 0;
    // "b" failed on its own account; the refused one before it isn't sent along.
    box.retry('id-b');
    await until(() => expect(statuses(box)).toEqual(['failed', 'sent']));
    expect(tries).toEqual(['id-b']);
    // Its own retry goes through, as the server now allows it.
    box.retry('id-bad');
    await until(() => expect(statuses(box)).toEqual(['sent', 'sent']));
  });

  it('lets the others through past a refused message', async () => {
    const box = new Outbox(async (m) => {
      if (m.text === 'bad') throw apiError(400);
      return `doc-${m.text}`;
    });
    box.enqueue(out('a'));
    box.enqueue(out('bad'));
    box.enqueue(out('c'));
    await until(() => expect(statuses(box)).toEqual(['sent', 'failed', 'sent']));
  });

  it('knows what the server says no to from what will pass', () => {
    expect(refusedByServer(apiError(403))).toBe(true);
    expect(refusedByServer(apiError(400))).toBe(true);
    expect(refusedByServer(apiError(404))).toBe(true);
    expect(refusedByServer(apiError(429))).toBe(false);
    expect(refusedByServer(apiError(401))).toBe(false);
    expect(refusedByServer(apiError(408))).toBe(false);
    expect(refusedByServer(apiError(500))).toBe(false);
    expect(refusedByServer(offline())).toBe(false);
    expect(refusedByServer(null)).toBe(false);
  });

  it('discards only a failed message', async () => {
    const hold = gate();
    const box = new Outbox(async (m) => {
      if (m.text === 'bad') throw apiError(403);
      await hold.promise;
      return 'doc';
    });
    box.enqueue(out('bad'));
    box.enqueue(out('a'));
    await until(() => expect(statuses(box)).toEqual(['failed', 'sending']));
    box.discard('id-a');
    expect(box.entries).toHaveLength(2);
    box.discard('id-bad');
    expect(box.entries.map((e) => e.clientId)).toEqual(['id-a']);
    hold.open();
    await until(() => expect(statuses(box)).toEqual(['sent']));
  });

  it('drops a message the conversation already shows, even if its answer never came', async () => {
    const hold = gate();
    const box = new Outbox(async () => {
      await hold.promise;
      return 'doc';
    });
    box.enqueue(out('a'));
    box.enqueue(out('b'));
    expect(statuses(box)).toEqual(['sending', 'queued']);
    // The answer to "a" was lost, but its document arrived: it stops being drawn twice.
    box.reconcile((m) => m.clientId === 'id-a');
    expect(box.entries.map((e) => e.clientId)).toEqual(['id-b']);
    hold.open();
    // "b" still goes out; the finished "a" finds nothing to update and does no harm.
    await until(() => expect(statuses(box)).toEqual(['sent']));
  });

  it('forgets everything on clear, and sends what is written after it', async () => {
    const hold = gate();
    const box = new Outbox(async (m) => {
      if (m.text === 'a') await hold.promise;
      return `doc-${m.text}`;
    });
    box.enqueue(out('a'));
    expect(statuses(box)).toEqual(['sending']);
    box.clear();
    expect(box.entries).toEqual([]);
    box.enqueue(out('b'));
    await until(() => expect(statuses(box)).toEqual(['sent']));
    // The send from before the clear comes back unheard.
    hold.open();
    await new Promise((r) => setTimeout(r, 5));
    expect(box.entries.map((e) => [e.clientId, e.serverId])).toEqual([['id-b', 'doc-b']]);
  });

  it('makes client ids of twenty letters and digits', () => {
    const ids = Array.from({ length: 50 }, newClientId);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(new Set(ids).size).toBe(50);
  });
});
