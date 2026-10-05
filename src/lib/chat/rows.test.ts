import { describe, it, expect } from 'vitest';
import type { ChatMessage } from './message';
import { threadRows } from './rows';

/** Messenger's stacking: runs of one sender's messages sent close together, broken by labels. */
const at = (h: number, m: number, s = 0) => new Date(Date.UTC(2026, 2, 1, h, m, s));
const utcDay = (d: Date) => d.toISOString().slice(0, 10);
let n = 0;
const msg = (sender: string, sentAt: Date, extra: Partial<ChatMessage> = {}): ChatMessage => {
  const id = `m${n++}`;
  return { id, key: id, senderId: sender, text: id, sentAt, delivery: 'delivered', ...extra };
};
const layout = (messages: ChatMessage[]) => threadRows(messages, utcDay);
const positions = (messages: ChatMessage[]) => layout(messages).map((r) => r.position);

describe('threadRows', () => {
  it('stacks one sender’s messages sent close together into a run', () => {
    expect(
      positions([
        msg('alice', at(10, 0)),
        msg('alice', at(10, 1)),
        msg('alice', at(10, 2)),
        msg('me', at(10, 2, 30)),
        msg('alice', at(10, 3)),
      ]),
    ).toEqual(['first', 'middle', 'last', 'single', 'single']);
  });

  it('breaks a run at a gap of three minutes', () => {
    expect(positions([msg('alice', at(10, 0)), msg('alice', at(10, 2, 59)), msg('alice', at(10, 5, 59))])).toEqual([
      'first',
      'last',
      'single',
    ]);
  });

  it('labels the first message of each day and one that comes a quarter of an hour after the one before', () => {
    const rows = layout([
      msg('alice', at(10, 0)),
      msg('alice', at(10, 14, 59)),
      msg('alice', at(10, 30)),
      msg('alice', new Date(Date.UTC(2026, 2, 2, 9, 0))),
    ]);
    expect(rows.map((r) => [r.dayLabel, r.timeLabel])).toEqual([
      [true, false],
      [false, false],
      [false, true],
      [true, false],
    ]);
    // A label is a break: nothing stacks across it.
    expect(rows.map((r) => r.position)).toEqual(['single', 'single', 'single', 'single']);
  });

  it('opens a run with a reply, and ends one at a message that failed to send', () => {
    const replyTo = { id: 'x', senderId: 'me', text: 'q' };
    expect(
      positions([
        msg('alice', at(10, 0)),
        msg('alice', at(10, 0, 10), { replyTo }),
        msg('alice', at(10, 0, 20)),
        msg('me', at(10, 1), { delivery: 'failed' }),
        msg('me', at(10, 1, 5), { delivery: 'sending' }),
      ]),
    ).toEqual(['single', 'first', 'last', 'single', 'single']);
  });

  // The twin of the apps' aNoteOpensARunOfItsOwnLikeAReply: a note leads with its caption and card.
  it('opens a run with a note, as with a reply', () => {
    const rows = layout([
      msg('bob', at(9, 0)),
      msg('bob', at(9, 0, 20), { kind: 'note', cardRef: 'walk' }),
      msg('bob', at(9, 0, 40)),
    ]);
    expect(rows.map((r) => r.position)).toEqual(['single', 'first', 'last']);
    expect(rows.map((r) => r.joinsAbove)).toEqual([false, false, true]);
  });

  it('says which neighbours a bubble joins', () => {
    const rows = layout([msg('alice', at(10, 0)), msg('alice', at(10, 1)), msg('alice', at(10, 2))]);
    expect(rows.map((r) => [r.joinsAbove, r.joinsBelow])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
  });

  it('keeps a message on its way in the run despite this browser’s clock running a little behind', () => {
    expect(positions([msg('me', at(10, 1)), msg('me', at(10, 0, 58), { delivery: 'sending' })])).toEqual(['first', 'last']);
  });

  it('lays out nothing for no messages', () => {
    expect(layout([])).toEqual([]);
  });
});
