import type { ChatMessage } from './message';

/**
 * Where a message sits in a run of messages from one person: it picks the
 * corners the bubble tucks (on the sender's side).
 *
 * - `single`: alone, all four corners round.
 * - `first`: the corner facing the next message (bottom) is tucked.
 * - `middle`: both corners facing a neighbour are tucked.
 * - `last`: the corner facing the one before (top) is tucked.
 */
export type RunPosition = 'single' | 'first' | 'middle' | 'last';

/**
 * One message of the thread with what the list needs around it: its place in
 * a run (Messenger's stacking), and the labels that lead it. `dayLabel` leads
 * the first message of a day; `timeLabel` leads a message that comes
 * {@link TIME_LABEL_GAP_MS} or more after the one before it on the same day.
 * A label is a break: nothing stacks across one.
 */
export interface ThreadRow {
  message: ChatMessage;
  position: RunPosition;
  dayLabel: boolean;
  timeLabel: boolean;
  /** It stacks under the message before it (the tight gap, and its top corner on the sender's side tucks). */
  joinsAbove: boolean;
  /** The message after it stacks under it (its bottom corner on the sender's side tucks). */
  joinsBelow: boolean;
}

/** Messages further apart than this don't stack. */
export const RUN_GAP_MS = 3 * 60_000;
/** A message this long after the one before it (on the same day) gets a time label. */
export const TIME_LABEL_GAP_MS = 15 * 60_000;

/** The reader's calendar day of a moment (local time). */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Lays the thread out in runs, the way Messenger stacks messages sent close
 * together — the twin of the apps' ThreadRows: consecutive messages from the
 * same sender, less than {@link RUN_GAP_MS} apart on the same day, with no
 * label between them, are one run; a reply opens a run (it leads with the
 * quote it answers), so does a note (it leads with the card it was left on),
 * and a message that failed to send ends the run it is in (its "not sent"
 * line sits under it).
 *
 * `messages` oldest first, as the thread holds them; `dayOf` names a
 * message's calendar day (the reader's, by default).
 */
export function threadRows(messages: readonly ChatMessage[], dayOf: (d: Date) => string = localDay): ThreadRow[] {
  const n = messages.length;
  const days = messages.map((m) => dayOf(m.sentAt));
  const day = messages.map((_, i) => i === 0 || days[i] !== days[i - 1]);
  const time = messages.map(
    (m, i) => i > 0 && !day[i] && m.sentAt.getTime() - messages[i - 1].sentAt.getTime() >= TIME_LABEL_GAP_MS,
  );
  const joins = messages.map((m, i) => {
    const before = messages[i - 1];
    return (
      !!before &&
      !day[i] &&
      !time[i] &&
      // A reply opens with the quote it answers, a note with the card it was left on: each starts a run of its own.
      !m.replyTo &&
      m.kind !== 'note' &&
      before.senderId === m.senderId &&
      before.delivery !== 'failed' &&
      // A message still on its way carries this browser's clock: a few seconds off the server's doesn't unstack it.
      Math.abs(m.sentAt.getTime() - before.sentAt.getTime()) < RUN_GAP_MS
    );
  });
  return messages.map((message, i) => {
    const above = joins[i];
    const below = i + 1 < n && joins[i + 1];
    const position: RunPosition = above && below ? 'middle' : above ? 'last' : below ? 'first' : 'single';
    return { message, position, dayLabel: day[i], timeLabel: time[i], joinsAbove: above, joinsBelow: below };
  });
}
