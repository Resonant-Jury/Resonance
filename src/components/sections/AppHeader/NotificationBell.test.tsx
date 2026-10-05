// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { renderWithIntl, screen, userEvent, within } from '@/../test/render';
import type { Notification } from '@/lib/db/types';
import { bellHref, onAnonymousCard } from './bellLink';
import { NotificationBell } from './NotificationBell';
import zhTW from '@/messages/zh-TW.json';

// The header's bell, on its live list (useNotifications) and the read mark it writes: where each row leads.

vi.mock('@/i18n/navigation', () => ({
  // Where it would go is the href; jsdom goes nowhere.
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest} onClick={(e) => e.preventDefault()}>
      {children}
    </a>
  ),
}));

const live = vi.hoisted(() => ({ rows: [] as Notification[] }));
vi.mock('@/lib/data/hooks', () => ({
  useNotifications: () => ({ data: live.rows, error: null }),
}));
const markNotificationRead = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/db/firestore/client/notifications', () => ({ markNotificationRead }));
// Opening a thread is what marks a conversation read; nothing here may.
const markConversationRead = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/db/firestore/client/messages', () => ({ markConversationRead }));

const at = new Date('2026-10-01T08:00:00Z');
const bell = (id: string, type: Notification['type'], payload: Record<string, unknown>): Notification => ({
  id,
  userId: 'me',
  type,
  payload,
  readAt: null,
  createdAt: at,
});

const anonymousNote = bell('n1', 'note', {
  noteId: 'note1', cardId: 'masked', fromUserId: 'bob', fromHandle: 'bob', preview: 'Your letter stayed with me.', anonymous: true,
});
const anonymousResonance = bell('n2', 'resonance', { fromUserId: 'bob', fromHandle: 'bob', cardId: 'masked', anonymous: true });
const namedNote = bell('n3', 'note', {
  noteId: 'note2', cardId: 'walk', fromUserId: 'carol', fromHandle: 'carol', preview: 'Thank you for the walk.',
});
const namedResonance = bell('n4', 'resonance', { fromUserId: 'carol', fromHandle: 'carol', cardId: 'walk' });

async function openBell() {
  const user = userEvent.setup();
  renderWithIntl(<NotificationBell />);
  await user.click(screen.getByRole('button', { name: 'Notifications' }));
  return { user, list: screen.getByRole('dialog') };
}

describe('the bell’s rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    live.rows = [anonymousNote, anonymousResonance, namedNote, namedResonance];
  });

  it('open the card for a note or resonance on an anonymous card, never its writer’s thread', async () => {
    const { list } = await openBell();
    const links = within(list).getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/card/masked',
      '/card/masked',
      '/messages/carol?note=note2&card=walk',
      '/messages/carol',
    ]);
    expect(links.filter((a) => a.getAttribute('href')?.startsWith('/messages/bob'))).toEqual([]);
  });

  it('show the note’s own words in the row, on an anonymous card too', async () => {
    const { list } = await openBell();
    const [anonymous] = within(list).getAllByRole('link');
    expect(anonymous).toHaveTextContent('bob sent you a little note');
    expect(anonymous).toHaveTextContent('「Your letter stayed with me.」');
    expect(within(list).getByText('「Thank you for the walk.」')).toBeInTheDocument();
  });

  // The dot ends the line that says who it is from; under a note's words it read as a mark on the note.
  it('put the unread dot of a note row on its first line, before the note’s words', async () => {
    const { list } = await openBell();
    const row = within(list).getAllByRole('link')[2];
    const dot = row.querySelector('[data-unread-dot]')!;
    const words = within(row).getByText('「Thank you for the walk.」');
    expect(dot).not.toBeNull();
    expect(dot.compareDocumentPosition(words) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(words.contains(dot)).toBe(false);
  });

  // In the reader's language, the bell and its list as every row: never English words in zh-TW.
  it('name the bell and its list, and an expired invite, in the reader’s language', async () => {
    live.rows = [bell('n5', 'invite_expired', {})];
    const user = userEvent.setup();
    renderWithIntl(<NotificationBell />, { locale: 'zh-TW', messages: zhTW });
    await user.click(screen.getByRole('button', { name: zhTW.app.nav.notifications }));
    const list = screen.getByRole('dialog', { name: zhTW.app.nav.notifications });
    expect(within(list).getByText(zhTW.app.notifications.inviteExpired)).toBeInTheDocument();
    expect(screen.queryByText('Invite expired')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
  });

  it('mark only the bell row read when one on an anonymous card is opened — no conversation, and offer no reply', async () => {
    const { user, list } = await openBell();
    await user.click(within(list).getAllByRole('link')[0]);
    expect(markNotificationRead).toHaveBeenCalledWith('n1');
    expect(markConversationRead).not.toHaveBeenCalled();
    // The row is the only way on: nothing in the list answers the writer.
    expect(screen.queryByRole('button', { name: /reply/i })).toBeNull();
  });
});

describe('bellHref', () => {
  it('leads a flagged row to its card, and a row without the flag where it always went', () => {
    expect(onAnonymousCard(anonymousNote)).toBe(true);
    expect(onAnonymousCard(namedNote)).toBe(false);
    // Only notes and resonances answer for a card's author: the flag on any other row changes nothing.
    expect(onAnonymousCard(bell('x', 'message', { fromHandle: 'bob', anonymous: true }))).toBe(false);
    expect(bellHref(bell('x', 'message', { fromHandle: 'bob', anonymous: true }))).toBe('/messages/bob');
    // Only `true` is the flag.
    expect(bellHref(bell('x', 'resonance', { fromHandle: 'bob', cardId: 'c', anonymous: 'true' }))).toBe('/messages/bob');
    // A flagged row whose card it can't name goes nowhere rather than to the thread.
    expect(bellHref(bell('x', 'note', { fromHandle: 'bob', anonymous: true }))).toBeNull();
  });

  it('keeps the other kinds where they led', () => {
    expect(bellHref(bell('x', 'invite', { fromHandle: 'bob' }))).toBe('/me');
    expect(bellHref(bell('x', 'invite_accepted', { fromHandle: 'bob' }))).toBe('/messages/bob');
    expect(bellHref(bell('x', 'card_link', { fromHandle: 'bob', cardId: 'c' }))).toBe('/card/c');
    expect(bellHref(bell('x', 'translation_done', { cardId: 'c' }))).toBe('/card/c');
    expect(bellHref(bell('x', 'resonance_summary', { count: 3 }))).toBeNull();
    // An older note bell, without the note's id: the thread, unquoted.
    expect(bellHref(bell('x', 'note', { fromHandle: 'bob', cardId: 'c' }))).toBe('/messages/bob');
    // No pen name to open a thread by: nowhere, never /messages/undefined.
    expect(bellHref(bell('x', 'message', {}))).toBeNull();
  });
});
