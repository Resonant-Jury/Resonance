// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, onTestFinished } from 'vitest';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { act, fireEvent, renderWithIntl, screen, waitFor, within } from '@/../test/render';
import type { FeedCardBody } from '@/lib/api/v1/schemas';
import type { Conversation, Message, User } from '@/lib/db/types';

// The cards shared in a thread, on the real data hooks: the client read/write
// layer (the thread's listener and older pages included), the v1 API
// (callApi), auth and navigation are the module boundary.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));
vi.mock('@/lib/db/firestore/client/api', () => ({ callApi: vi.fn(), ApiError: class extends Error {} }));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: vi.fn(),
  isConnected: vi.fn(async () => true),
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  getUserById: vi.fn(),
  resolveCardId: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(async () => new Set()),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
// The conversation as the server holds it: its listener hears `messages` at once, and again on `deliver`.
const server = vi.hoisted(() => ({
  messages: [] as Message[],
  emit: null as ((window: unknown) => void) | null,
  windowOf: (messages: Message[]) => ({
    entries: [...messages].reverse().map((message) => ({ message, cursor: { seconds: 0, nanoseconds: 0, id: message.id } })),
    fromCache: false,
  }),
}));
vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  conversationId: (a: string, b: string) => [a, b].sort().join('_'),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(async () => {}),
  sendMessage: vi.fn(),
  deleteConversation: vi.fn(),
  listenThread: vi.fn((_pairId: string, onWindow: (window: unknown) => void) => {
    server.emit = onWindow;
    onWindow(server.windowOf(server.messages));
    return () => {};
  }),
  getOlderMessages: vi.fn(async () => []),
}));
/** The thread's listener hears these messages now. */
const deliver = (messages: Message[]) => act(() => server.emit!(server.windowOf(messages)));
vi.mock('@/components/molecules/MarkdownEditor/InsertCardModal', () => ({ InsertCardModal: () => null }));

import { callApi } from '@/lib/db/firestore/client/api';
import { getCardById, getCardBySlugOrId, getUserByHandle, getUserById, isConnected } from '@/lib/db/firestore/client/reads';
import { getConversation, getOlderMessages, sendMessage } from '@/lib/db/firestore/client/messages';
import { forgetOutboxes } from '@/lib/data/thread';
import { useConnectionRefresh } from '@/lib/data/resonate';
import { SWR_DEFAULTS } from '@/components/providers/SWRProvider';
import { wobRect } from '@/lib/design/wobRect';
import { ThreadView } from './ThreadView';

const alice: User = {
  id: 'alice',
  handle: 'alice',
  region: 'TW',
  primaryLocale: 'en',
  autoTranslateTo: [],
  verified: false,
  phoneHash: '',
  avatarSeed: '7',
  initials: 'AL',
  accentColor: 'x',
  joinedAt: new Date('2025-01-01'),
  handleChangedAt: new Date('2025-01-01'),
};
const conversation: Conversation = {
  id: 'alice_me',
  participants: ['alice', 'me'],
  createdAt: new Date(),
  updatedAt: new Date(),
  lastMessage: { text: 'hi', senderId: 'alice', sentAt: new Date() },
  unread: { me: 0, alice: 0 },
};

function message(id: string, cardRef?: string): Message {
  return { id, senderId: 'alice', text: cardRef ? '' : 'hello', sentAt: new Date('2026-03-01T10:00:00Z'), ...(cardRef ? { cardRef } : {}) };
}

function summary(id: string, title: string, extra: Partial<FeedCardBody> = {}): FeedCardBody {
  return {
    id,
    slug: `${id}-slug`,
    title,
    excerpt: '',
    tags: [],
    publishedAt: '2026-02-01T00:00:00.000Z',
    author: { id: 'w', handle: 'writer', initials: 'W', accentColor: 'x', avatarUrl: null, avatarSeed: '3', verified: false, region: null },
    anonymous: false,
    visibility: 'public',
    imageUrl: null,
    imageLabel: null,
    accentHue: null,
    readMinutes: 1,
    referenceCardId: null,
    reason: null,
    ...extra,
  };
}

function thread() {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ThreadView handle="alice" />
    </SWRConfig>
  );
}

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
  vi.mocked(getUserByHandle).mockResolvedValue(alice);
  vi.mocked(getConversation).mockResolvedValue(conversation);
  vi.mocked(isConnected).mockResolvedValue(true);
});
afterEach(() => {
  vi.clearAllMocks();
  forgetOutboxes();
  server.messages = [];
});

describe('cards shared in a thread', () => {
  it('come in one request for the whole thread, each card once, instead of one read each', async () => {
    server.messages = [message('m1', 'c1'), message('m2', 'c2'), message('m3'), message('m4', 'c1'), message('m5', 'gone')];
    vi.mocked(callApi).mockResolvedValue({ cards: [summary('c1', 'A walk at dawn'), summary('c2', 'An unsigned letter', { anonymous: true, author: null })] });

    renderWithIntl(thread());

    expect(await screen.findAllByText('A walk at dawn')).toHaveLength(2);
    expect(screen.getByText('An unsigned letter')).toBeInTheDocument();
    // An anonymous card's byline stays unsaid; a card the viewer can't read isn't drawn.
    expect(screen.getAllByText('writer')).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /A walk at dawn/ })[0]).toHaveAttribute('href', '/card/c1-slug');

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c1,c2,gone');
    expect(getCardById).not.toHaveBeenCalled();
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
  });

  it('lets each shared card read its own when the request fails — even after an earlier list came through', async () => {
    server.messages = [message('m1', 'c1')];
    vi.mocked(callApi).mockResolvedValueOnce({ cards: [summary('c1', 'A walk at dawn')] });
    renderWithIntl(thread());
    expect(await screen.findByText('A walk at dawn')).toBeInTheDocument();

    // Another card is shared, and the request for it fails.
    vi.mocked(callApi).mockRejectedValue(new Error('offline'));
    vi.mocked(getCardBySlugOrId).mockImplementation(async (key: string) => ({
      id: key,
      authorId: 'alice',
      slug: `${key}-slug`,
      thoughtCore: `Card ${key}, read by itself`,
      story: '## By the river\n\nWalking **slowly** home, [the long way](https://example.com).',
      tags: [],
      originalLocale: 'en',
      translations: {},
      visibility: 'public',
      publishedAt: new Date('2026-02-01'),
      readCount: 0,
      resonanceCount: 0,
      inviteCount: 0,
    }));
    vi.mocked(getUserById).mockResolvedValue(alice);
    deliver([message('m1', 'c1'), message('m2', 'c2')]);

    expect(await screen.findByText('Card c2, read by itself')).toBeInTheDocument();
    expect(getCardBySlugOrId).toHaveBeenCalledWith('c2');
    // Read in full, its story is Markdown: the bubble shows its words, and its read time all the same.
    expect(screen.getByText('By the river Walking slowly home, the long way.')).toBeInTheDocument();
    expect(screen.getAllByText('Resonance · 1 min')).toHaveLength(2);
    // The card that came through stays as it was, without a read of its own.
    expect(screen.getByText('A walk at dawn')).toBeInTheDocument();
    expect(getCardBySlugOrId).not.toHaveBeenCalledWith('c1');
  });

  it('asks only for a newly shared card, keeping the cards it has on screen while it loads', async () => {
    server.messages = [message('m1', 'c1')];
    vi.mocked(callApi).mockResolvedValueOnce({ cards: [summary('c1', 'A walk at dawn')] });
    renderWithIntl(thread());
    expect(await screen.findByText('A walk at dawn')).toBeInTheDocument();

    // A new message shares another card; its preview is still on the way.
    vi.mocked(callApi).mockReturnValueOnce(new Promise(() => {}));
    deliver([message('m1', 'c1'), message('m2', 'c2')]);
    await waitFor(() => expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c2'));
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(screen.getByText('A walk at dawn')).toBeInTheDocument();
  });

  it('asks for the card a Resonance card link leads to, by its slug, with the shared ones', async () => {
    server.messages = [
      message('m1', 'c1'),
      { ...message('m2'), text: 'read this https://resonance.channel/zh-TW/card/rich-story' },
      { ...message('m3'), text: 'and https://example.com/card/not-ours' },
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    await waitFor(() => expect(callApi).toHaveBeenCalledWith('/api/v1/cards?keys=c1,rich-story'));
    expect(callApi).toHaveBeenCalledTimes(1);
  });
});

function text(id: string, body: string, extra: Partial<Message> = {}, senderId = 'alice'): Message {
  return { id, senderId, text: body, sentAt: new Date('2026-03-01T10:00:00Z'), ...extra };
}

describe('replies, links and link previews in a thread', () => {
  it('shows what a reply answers above its bubble, and scrolls to the original when it is loaded', async () => {
    // The thread's own scroller moves to the original (never the page around it).
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
    server.messages = [
      text('m1', 'Are you coming on Friday?', {}, 'me'),
      text('m2', 'Yes!', { replyTo: { id: 'm1', senderId: 'me', text: 'Are you coming on Friday?' } }),
      text('m3', 'Sure', { replyTo: { id: 'old', senderId: 'alice', text: 'much earlier' } }),
      text('m4', 'Thanks', { replyTo: { id: 'm1', senderId: 'me', text: '', cardRef: 'c1' } }),
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());

    expect(await screen.findAllByText('alice replied to you')).toHaveLength(2);
    expect(screen.getByText('alice replied to themselves')).toBeInTheDocument();
    // A card-only original reads as「A card」.
    expect(screen.getByRole('button', { name: 'A card' })).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Are you coming on Friday?' })[0]);
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    scrollTo.mockClear();
    // Not in this conversation, which is all here (fewer than a window): nothing to scroll to.
    await user.click(screen.getByRole('button', { name: 'much earlier' }));
    await new Promise((r) => setTimeout(r, 10));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('draws the link preview under the bubble, picture from our own route only', async () => {
    server.messages = [
        text('m1', 'look https://example.com/post', {
          preview: {
            url: 'https://www.example.com/post',
            title: 'A post worth reading',
            description: 'About walking.',
            image: '/api/link-image?u=abc&s=def',
          },
        }),
      ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const { container } = renderWithIntl(thread());

    const card = (await screen.findByText('A post worth reading')).closest('a')!;
    expect(card).toHaveAttribute('href', 'https://www.example.com/post');
    expect(card).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc');
    expect(card).toHaveAttribute('target', '_blank');
    expect(card).toHaveTextContent('example.com');
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('src', '/api/link-image?u=abc&s=def');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
  });

  it('draws no preview card for an address that is not a plain http(s) link', async () => {
    server.messages = [text('m1', 'hmm', { preview: { url: 'https://user@example.com/', title: 'Sneaky' } })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    await screen.findByText('hmm');
    expect(screen.queryByText('Sneaky')).not.toBeInTheDocument();
  });

  it('makes only safe http(s) addresses tappable', async () => {
    server.messages = [
        text('m1', 'ok https://example.com/a. and www.example.org'),
        text('m2', 'bad javascript:alert(1) data:text/html,hi http://user@evil.com/x https://example.com:8443/'),
      ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    await screen.findByText(/^bad /);

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['https://example.com/a', 'https://www.example.org/']));
    for (const href of hrefs) expect(href).toMatch(/^(https?:\/\/(www\.)?example\.(com\/a|org\/)|\/)/);
    expect(screen.getByText(/javascript:alert/)).not.toHaveAttribute('href');
  });

  it('asks before opening a link to an IP address or a punycode name', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    server.messages = [text('m1', 'try http://192.168.0.5/admin or https://xn--pple-43d.com/')];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const userEvent = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());

    await userEvent.click(await screen.findByRole('link', { name: 'http://192.168.0.5/admin' }));
    expect(open).not.toHaveBeenCalled();
    expect(await screen.findByText('Open this link?')).toBeInTheDocument();
    expect(screen.getByText(/leads to 192\.168\.0\.5/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(open).toHaveBeenCalledWith('http://192.168.0.5/admin', '_blank', 'noopener,noreferrer');
    open.mockRestore();
  });

  // A new tab asked for on purpose (a modifier, a middle click, the browser's own menu) asks first too: the
  // link carries no address the browser could open by itself.
  it('asks first however a link to an IP address is opened', async () => {
    server.messages = [text('m1', 'try http://192.168.0.5/admin')];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    const link = await screen.findByRole('link', { name: 'http://192.168.0.5/admin' });
    expect(link).not.toHaveAttribute('href');
    fireEvent.click(link, { ctrlKey: true });
    expect(await screen.findByText('Open this link?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(link, { key: 'Enter' });
    expect(await screen.findByText('Open this link?')).toBeInTheDocument();
  });
});

describe('Messenger’s thread, drawn by hand', () => {
  const at = (h: number, m: number) => new Date(2026, 2, 1, h, m);

  it('stacks one person’s messages into runs, their face beside the last of each of their runs', async () => {
    server.messages = [
      text('m1', 'Morning!', { sentAt: at(10, 0) }),
      text('m2', 'Coffee later?', { sentAt: at(10, 1) }),
      text('m3', 'Sure', { sentAt: at(10, 2) }, 'me'),
      text('m4', 'See you at noon', { sentAt: at(10, 30) }),
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const { container } = renderWithIntl(thread());
    await screen.findByText('See you at noon');

    const row = (id: string) => container.querySelector<HTMLElement>(`[data-message-id="${id}"]`)!;
    expect(['m1', 'm2', 'm3', 'm4'].map((id) => row(id).dataset.run)).toEqual(['first', 'last', 'single', 'single']);
    // Inside a run the bubbles nearly touch; a pause of 15 minutes or more brings a time label.
    expect(row('m2').dataset.gap).toBe('run');
    expect(row('m3').dataset.gap).toBe('runs');
    expect(row('m4').dataset.gap).toBe('label');
    // Their face stands beside the last of each of their runs only; never beside your own.
    const faces = (id: string) => row(id).querySelectorAll('a[href="/u/alice"]').length;
    expect(['m1', 'm2', 'm3', 'm4'].map(faces)).toEqual([0, 1, 0, 1]);
  });

  it('carries a link’s preview inside the message’s own bubble', async () => {
    server.messages = [
      text('m1', 'look https://example.com/post', {
        preview: { url: 'https://example.com/post', title: 'A post worth reading', image: '/api/link-image?u=abc&s=def' },
      }),
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const { container } = renderWithIntl(thread());
    const title = await screen.findByText('A post worth reading');
    // One bubble: the words, then the picture and the title.
    const bubble = container.querySelector('[data-message-id="m1"] [data-width="preview"]')!;
    expect(bubble).toContainElement(title);
    expect(bubble).toHaveTextContent('look https://example.com/post');
    expect(bubble.querySelector('img')).toHaveAttribute('src', '/api/link-image?u=abc&s=def');
  });

  it('draws a Resonance card link as the card it leads to — and as a link again when the card can’t be seen', async () => {
    server.messages = [
      text('m1', 'https://resonance.channel/zh-TW/card/rain-walk', { sentAt: at(9, 0) }),
      text('m2', 'and https://resonance.channel/card/hidden-one', {
        sentAt: at(11, 0),
        preview: { url: 'https://resonance.channel/card/hidden-one', title: 'A card you can’t see' },
      }),
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [summary('c9', 'One walk after the rain', { slug: 'rain-walk', readMinutes: 3 })] });
    const { container } = renderWithIntl(thread());

    const card = await screen.findByRole('link', { name: /One walk after the rain/ });
    expect(card).toHaveAttribute('href', '/card/rain-walk');
    // A shared post: who wrote it, where it comes from and how long it reads, then the source line.
    expect(card).toHaveTextContent('writer');
    expect(card).toHaveTextContent('Resonance · 3 min');
    // The link alone stood for the card: its address isn't said again.
    expect(container.querySelector('[data-message-id="m1"]')).not.toHaveTextContent('https://resonance.channel');
    // The card the viewer can't see falls back to the link and its preview.
    expect(screen.getByText('A card you can’t see')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="m2"] [data-width="preview"]')).toBeInTheDocument();
  });

  it('offers reply and「⋯」beside a message: copy it, and its link’s open and copy', async () => {
    server.messages = [text('m1', 'read https://example.com/a', { sentAt: at(10, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    // The clipboard user-event puts in place.
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    renderWithIntl(thread());
    await screen.findByRole('link', { name: 'https://example.com/a' });

    await user.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Copy', 'Open link', 'Copy link']);
    await user.click(screen.getByRole('menuitem', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://example.com/a');
    expect(await screen.findByRole('status')).toHaveTextContent('Copied');

    await user.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to alice')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Conversation with alice' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Cancel reply' }));
    expect(screen.queryByText('Replying to alice')).not.toBeInTheDocument();
  });

  it('lifts a message pressed and held on a touch screen out of the thread, with its menu', async () => {
    server.messages = [text('m1', 'hold me', { sentAt: at(10, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('hold me');

    const message = container.querySelector<HTMLElement>('[data-message-id="m1"] div[class*="message"]')!;
    fireEvent.pointerDown(message, { pointerType: 'touch', button: 0, clientX: 40, clientY: 40 });
    const menu = await screen.findByRole('dialog', {}, { timeout: 1500 });
    fireEvent.pointerUp(message, { pointerType: 'touch', button: 0 });
    // Its place in the thread stays empty under the scrim while a copy is lifted.
    expect(container.querySelector('[data-message-id="m1"]')).toHaveAttribute('data-lifted');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Reply', 'Copy']);

    await user.click(within(menu).getByRole('menuitem', { name: 'Reply' }));
    // Done in the tap itself (iOS raises the keyboard only for a focus a tap gave), then the menu goes.
    expect(screen.getByText('Replying to alice')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Conversation with alice' })).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the menu when the finger that held the message lifts over the scrim, and puts it away on a tap there', async () => {
    server.messages = [text('m1', 'hold me', { sentAt: at(10, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const { container } = renderWithIntl(thread());
    await screen.findByText('hold me');

    const message = container.querySelector<HTMLElement>('[data-message-id="m1"] div[class*="message"]')!;
    fireEvent.pointerDown(message, { pointerType: 'touch', button: 0, clientX: 40, clientY: 40 });
    const menu = await screen.findByRole('dialog', {}, { timeout: 1500 });
    const scrim = within(menu).getByRole('button', { name: 'Close' });
    // The browser's tap for the lifting finger lands on the scrim, which had no press of its own.
    fireEvent.pointerUp(message, { pointerType: 'touch', button: 0 });
    fireEvent.click(scrim, { detail: 1 });
    await new Promise((r) => setTimeout(r, 200));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.pointerDown(scrim, { pointerType: 'touch', button: 0 });
    fireEvent.click(scrim, { detail: 1 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('a mouse never long-presses (it has the tools beside the message)', async () => {
    server.messages = [text('m1', 'click me', { sentAt: at(10, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const { container } = renderWithIntl(thread());
    await screen.findByText('click me');
    const message = container.querySelector<HTMLElement>('[data-message-id="m1"] div[class*="message"]')!;
    fireEvent.pointerDown(message, { pointerType: 'mouse', button: 0 });
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('searches like LINE: a list of the matches, then the thread at the one picked, stepping between them', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
    server.messages = [
      text('m1', 'Coffee at nine?', { sentAt: at(9, 0) }),
      text('m2', 'Tea for me', { sentAt: at(9, 30) }, 'me'),
      text('m3', 'More coffee then', { sentAt: at(10, 0) }),
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());
    await screen.findByText('More coffee then');

    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search messages' }));
    expect(screen.getByText('Search the words in your messages')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), 'coffee');

    const list = await screen.findByRole('region', { name: 'Search messages' });
    expect(within(list).getByText('2 matches')).toBeInTheDocument();
    const results = within(list).getAllByRole('button');
    // Newest first, the match marked.
    expect(results.map((r) => r.textContent)).toEqual([expect.stringContaining('More coffee then'), expect.stringContaining('Coffee at nine?')]);
    expect(within(results[0]).getByText('coffee', { selector: 'mark' })).toBeInTheDocument();

    await user.click(results[0]);
    expect(screen.queryByRole('region', { name: 'Search messages' })).not.toBeInTheDocument();
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    // The match being looked at is marked stronger than the others.
    expect(document.querySelector('mark[data-strong]')).toHaveTextContent('coffee');

    await user.click(screen.getByRole('button', { name: 'Earlier match' }));
    expect(screen.getByText('2 of 2')).toBeInTheDocument();
    expect(document.querySelector('mark[data-strong]')).toHaveTextContent('Coffee');
    expect(screen.getByRole('button', { name: 'Earlier match' })).toBeDisabled();

    // Escape leaves the search wherever the focus is, and takes the marks with it.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('textbox', { name: 'Search messages' })).not.toBeInTheDocument();
    expect(document.querySelector('mark')).toBeNull();
  });

  it('keeps the search when Escape closes a dialog over it', async () => {
    server.messages = [text('m1', 'coffee at http://192.168.0.5/menu', { sentAt: at(9, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());
    await screen.findByText(/^coffee at/);
    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search messages' }));
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), 'coffee');
    await user.click(within(await screen.findByRole('region', { name: 'Search messages' })).getAllByRole('button')[0]);

    await user.click(screen.getByRole('link', { name: 'http://192.168.0.5/menu' }));
    expect(await screen.findByText('Open this link?')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByText('Open this link?')).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: 'Search messages' })).toHaveValue('coffee');
    expect(screen.getByText('1 of 1')).toBeInTheDocument();
  });

  // Safari hands over the Enter that commits a word being composed (Zhuyin, Pinyin) after the composition
  // ended, known only by its key code: it commits the word, it doesn't send.
  it('doesn’t send on the Enter that commits a composed word', async () => {
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    const field = await screen.findByRole('textbox', { name: 'Conversation with alice' });
    fireEvent.change(field, { target: { value: '你好' } });
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
    expect(sendMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('alice', '你好', expect.anything()));
  });

  it('keeps a message that didn’t go, dimmed, with its retry under it and its delete in its menu', async () => {
    server.messages = [text('m1', 'hi', { sentAt: at(9, 0) })];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    vi.mocked(sendMessage).mockRejectedValue(new TypeError('Failed to fetch'));
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());
    await screen.findByText('hi');

    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation with alice' }), { target: { value: 'are you there' } });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('button', { name: 'Not sent · Tap to retry' })).toBeInTheDocument();

    const own = screen.getByText('are you there').closest('[data-message-key]')!;
    expect(own).toHaveAttribute('data-delivery', 'failed');
    await user.click(within(own as HTMLElement).getByRole('button', { name: 'More options' }));
    expect(screen.getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Copy', 'Retry', 'Delete']);
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(screen.queryByText('are you there')).not.toBeInTheDocument();
  });
});

describe('notes in a thread', () => {
  const note = (id: string, cardRef: string, body: string, senderId = 'alice'): Message => ({
    id,
    senderId,
    text: body,
    sentAt: new Date('2026-03-01T10:00:00Z'),
    cardRef,
    kind: 'note',
  });

  it('draws a note under the card it was left on, as a reply lies under its quote — on either side', async () => {
    server.messages = [
      note('n1', 'c1', 'Your walk stayed with me all day.'),
      { ...note('n2', 'c2', 'I loved this one too.', 'me'), sentAt: new Date('2026-03-01T10:20:00Z') },
    ];
    vi.mocked(callApi).mockResolvedValue({ cards: [summary('c1', 'A walk at dawn'), summary('c2', 'Their letter')] });
    const { container } = renderWithIntl(thread());

    expect(await screen.findByText('alice left a note on your card')).toBeInTheDocument();
    expect(screen.getByText("You left a note on alice's card")).toBeInTheDocument();
    // The card is the quote over the note, on the quieter fill, and opens the card; the note's words are its own bubble.
    const card = await screen.findByRole('link', { name: /A walk at dawn/ });
    expect(card).toHaveAttribute('href', '/card/c1-slug');
    expect(card.closest('[data-tone="quote"]')).toBeInTheDocument();
    expect(card).not.toHaveTextContent('Your walk stayed with me all day.');
    const words = screen.getByText('Your walk stayed with me all day.');
    expect(words.closest('[data-over-quote]')).toBeInTheDocument();
    expect(words.closest('[data-tone="quote"]')).toBeNull();
    // Not the old note label: the note isn't a reply to one.
    expect(screen.queryByText('In reply to your note')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-tone="quote"]')).toHaveLength(2);
  });

  it('quotes「A card」over a note on a card the viewer can no longer see', async () => {
    server.messages = [note('n1', 'gone', 'This one is gone now.')];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    expect(await screen.findByText('A card')).toBeInTheDocument();
    expect(screen.getByText('alice left a note on your card')).toBeInTheDocument();
    expect(screen.getByText('This one is gone now.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /A card/ })).not.toBeInTheDocument();
  });

  it('goes to the note it was opened for and answers it, with no older note’s quote', async () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo as unknown as Element['scrollTo'];
    server.messages = [text('m0', 'earlier'), note('n1', 'c1', 'Your walk stayed with me all day.')];
    vi.mocked(callApi).mockResolvedValue({ cards: [summary('c1', 'A walk at dawn')] });
    renderWithIntl(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ThreadView handle="alice" replyNote={{ noteId: 'n1', cardId: 'c1' }} />
      </SWRConfig>,
    );

    expect(await screen.findByText('Replying to alice')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Conversation with alice' })).toHaveFocus();
    await waitFor(() => expect(scrollTo).toHaveBeenCalled());
    expect(screen.queryByText('In reply to your note')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation with alice' }), { target: { value: 'thank you' } });
    vi.mocked(sendMessage).mockResolvedValue({ conversationId: 'alice_me', id: 'r1' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith('alice', 'thank you', expect.objectContaining({ replyTo: 'n1', noteRef: undefined })),
    );
  });
});

describe('a letter: notes between two people who aren’t connected', () => {
  const notes: Message[] = [
    { id: 'n1', senderId: 'me', text: 'Your walk stayed with me.', sentAt: new Date('2026-03-01T10:00:00Z'), cardRef: 'c1', kind: 'note' },
  ];

  it('shows the writer their letter and that the answer is the other’s to give', async () => {
    vi.mocked(isConnected).mockResolvedValue(false);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from: 'me', cardId: 'c1', count: 1 } });
    server.messages = notes;
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());

    expect(await screen.findByText("They'll see your note. Once they reply, you can keep talking.")).toBeInTheDocument();
    expect(screen.getByText('Your walk stayed with me.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Conversation with alice' })).not.toBeInTheDocument();
    // Taking the letter back is deleting the conversation, still offered.
    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    expect(screen.getByRole('menuitem', { name: 'Delete conversation' })).toBeInTheDocument();
  });

  it('lets the one a letter came to answer it, which connects the two', async () => {
    vi.mocked(isConnected).mockResolvedValue(false);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from: 'alice', cardId: 'c1', count: 1 } });
    server.messages = [{ ...notes[0], senderId: 'alice' }];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    vi.mocked(sendMessage).mockResolvedValue({ conversationId: 'alice_me', id: 'r1' });
    renderWithIntl(thread());

    expect(await screen.findByText('Reply to start talking with alice.')).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Conversation with alice' });
    const asked = vi.mocked(isConnected).mock.calls.length;
    vi.mocked(isConnected).mockResolvedValue(true);
    fireEvent.change(field, { target: { value: 'Thank you for this.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('alice', 'Thank you for this.', expect.anything()));
    // Answered, the two are connected: the thread asks again, and the line goes.
    await waitFor(() => expect(vi.mocked(isConnected).mock.calls.length).toBeGreaterThan(asked));
    await waitFor(() => expect(screen.queryByText('Reply to start talking with alice.')).not.toBeInTheDocument());
  });

  // The thread may hear the answer before the send does (the listener is quicker than the server's reply).
  it('reads again whether they are connected when the answer arrives before the send says so', async () => {
    vi.mocked(isConnected).mockResolvedValue(false);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from: 'alice', cardId: 'c1', count: 1 } });
    const note = { ...notes[0], senderId: 'alice' };
    server.messages = [note];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    vi.mocked(sendMessage).mockReturnValue(new Promise(() => {}));
    renderWithIntl(thread());
    expect(await screen.findByText('Reply to start talking with alice.')).toBeInTheDocument();
    const asked = vi.mocked(isConnected).mock.calls.length;
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getConversation).mockResolvedValue(conversation);
    deliver([note, text('r1', 'Thank you for this.', { sentAt: new Date('2026-03-01T10:05:00Z') }, 'me')]);
    await waitFor(() => expect(vi.mocked(isConnected).mock.calls.length).toBeGreaterThan(asked));
    await waitFor(() => expect(screen.queryByText('Reply to start talking with alice.')).not.toBeInTheDocument());
  });

  // A letter can stay on the conversation while the two are connected (a resonance doesn't clear it, only its
  // recipient's answer does): connected, it is no one's turn.
  it.each([
    ['the viewer', 'me'],
    ['the other', 'alice'],
  ])('ignores a letter from %s while the two are connected: the composer as ever, no line about whose turn it is', async (_who, from) => {
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from, cardId: 'c1', count: 1 } });
    server.messages = [{ ...notes[0], senderId: from }];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());

    expect(await screen.findByRole('textbox', { name: 'Conversation with alice' })).toBeInTheDocument();
    expect(screen.getByText('Your walk stayed with me.')).toBeInTheDocument();
    expect(screen.queryByText("They'll see your note. Once they reply, you can keep talking.")).not.toBeInTheDocument();
    expect(screen.queryByText('Reply to start talking with alice.')).not.toBeInTheDocument();
  });

  // …and once a take-back ends the connection (the card ⋯'s, elsewhere on the page), the letter is whose turn
  // it is again: the refresh that follows one reads the connection and the conversation again.
  it('shows the letter again when a take-back elsewhere ends the connection', async () => {
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from: 'me', cardId: 'c1', count: 1 } });
    server.messages = notes;
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    let tookBack: () => void = () => {};
    function TakeBack() {
      const refresh = useConnectionRefresh();
      tookBack = () => refresh();
      return null;
    }
    renderWithIntl(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ThreadView handle="alice" />
        <TakeBack />
      </SWRConfig>,
    );
    expect(await screen.findByRole('textbox', { name: 'Conversation with alice' })).toBeInTheDocument();
    const asked = vi.mocked(getConversation).mock.calls.length;

    vi.mocked(isConnected).mockResolvedValue(false);
    act(() => tookBack());
    expect(await screen.findByText("They'll see your note. Once they reply, you can keep talking.")).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Conversation with alice' })).not.toBeInTheDocument();
    // The conversation, whose letter it is, is read again with it.
    expect(vi.mocked(getConversation).mock.calls.length).toBeGreaterThan(asked);
  });

  // Their take-back ended it, in their browser: coming back to the tab is when this one hears of it.
  it('reads again on coming back to the tab whether they are still connected', async () => {
    vi.mocked(isConnected).mockResolvedValue(true);
    vi.mocked(getConversation).mockResolvedValue({ ...conversation, request: { from: 'me', cardId: 'c1', count: 1 } });
    server.messages = notes;
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(
      // SWR ignores focus for 5 s after mount by default; tests don't wait that long.
      <SWRConfig value={{ ...SWR_DEFAULTS, provider: () => new Map(), dedupingInterval: 0, focusThrottleInterval: 0 }}>
        <ThreadView handle="alice" />
      </SWRConfig>,
    );
    expect(await screen.findByRole('textbox', { name: 'Conversation with alice' })).toBeInTheDocument();

    vi.mocked(isConnected).mockResolvedValue(false);
    await new Promise((r) => setTimeout(r, 5));
    act(() => void window.dispatchEvent(new Event('focus')));
    expect(await screen.findByText("They'll see your note. Once they reply, you can keep talking.")).toBeInTheDocument();
  });

  it('keeps the messages of a conversation that no longer connects them, with the way to their profile', async () => {
    vi.mocked(isConnected).mockResolvedValue(false);
    server.messages = [text('m1', 'from before')];
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    expect(await screen.findByText('from before')).toBeInTheDocument();
    const line = (await screen.findByText("You can only message people you're connected with.")).parentElement!;
    expect(screen.queryByRole('textbox', { name: 'Conversation with alice' })).not.toBeInTheDocument();
    expect(within(line).getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/u/alice');
  });
});

describe('around the thread', () => {
  it('lists a card shared by its link among the thread’s cards, not its links', async () => {
    server.messages = [
      text('m1', 'https://resonance.channel/zh-TW/card/rain-walk'),
      text('m2', 'and https://example.com/post', {}, 'me'),
      message('m3', 'c1'),
    ];
    vi.mocked(callApi).mockResolvedValue({
      cards: [summary('c9', 'One walk after the rain', { slug: 'rain-walk' }), summary('c1', 'A walk at dawn')],
    });
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());
    await screen.findByRole('link', { name: /One walk after the rain/ });

    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cards & links' }));
    const list = await screen.findByRole('dialog', { name: 'Cards & links' });
    const cards = within(list).getByRole('heading', { name: 'Shared cards' }).parentElement!;
    expect(within(cards).getByRole('link', { name: /One walk after the rain/ })).toHaveAttribute('href', '/card/rain-walk');
    expect(within(cards).getByRole('link', { name: /A walk at dawn/ })).toBeInTheDocument();
    const links = within(list).getByRole('heading', { name: 'Links' }).parentElement!;
    expect(within(links).getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['https://example.com/post']);
  });

  // The apps draw the same outline (WobRectShape on seed 23), a little wider than tall, the plane centred as drawn.
  it('draws Send as a wobbly rounded rectangle, the field’s height', async () => {
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    renderWithIntl(thread());
    const send = await screen.findByRole('button', { name: 'Send' });
    const face = send.querySelector('svg')!;
    expect(face).toHaveAttribute('width', '48');
    expect(face).toHaveAttribute('height', '40');
    expect(face.querySelector('path')).toHaveAttribute(
      'd',
      wobRect(48, 40, 12, 23, 1.0, { segmentsH: 1, segmentsV: 1, curve: 1.3, cornerJitter: 2.4, cornerOffset: 2 }),
    );
  });
});

describe('a long conversation searched', () => {
  const at = (n: number) => new Date(Date.UTC(2026, 2, 1, 8) + n * 60_000);
  const long = Array.from({ length: 300 }, (_, i) =>
    text(`m${String(i + 1).padStart(3, '0')}`, i === 99 ? 'a needle in the hay' : `message ${i + 1}`, { sentAt: at(i) }),
  );
  const rowCount = (container: HTMLElement) => container.querySelectorAll('[data-message-key]').length;

  beforeEach(() => {
    // The listener holds the newest 50; older pages answer from the rest.
    server.messages = long.slice(-50);
    vi.mocked(getOlderMessages).mockImplementation(async (_pair, before, max) => {
      const end = long.findIndex((m) => m.id === before.id);
      return long
        .slice(Math.max(0, end - max), end)
        .reverse()
        .map((message) => ({ message, cursor: { seconds: 0, nanoseconds: 0, id: message.id } }));
    });
    vi.mocked(callApi).mockResolvedValue({ cards: [] });
    Element.prototype.scrollTo = vi.fn() as unknown as Element['scrollTo'];
  });
  afterEach(() => vi.mocked(getOlderMessages).mockImplementation(async () => []));

  /**
   * The reader well down a thread of rows 100 tall in a 600 window (jsdom's scroller would otherwise sit at its
   * top, reading page after page); `place.top` moves them.
   */
  function scrolledDown() {
    const place = { top: 5000 };
    const saved = (['scrollTop', 'scrollHeight', 'clientHeight'] as const).map(
      (key) => [key, Object.getOwnPropertyDescriptor(Element.prototype, key)!] as const,
    );
    Object.defineProperty(Element.prototype, 'scrollTop', { configurable: true, get: () => place.top, set: () => {} });
    Object.defineProperty(Element.prototype, 'scrollHeight', {
      configurable: true,
      get: () => document.querySelectorAll('[data-message-key]').length * 100,
    });
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    onTestFinished(() => {
      for (const [key, descriptor] of saved) Object.defineProperty(Element.prototype, key, descriptor);
    });
    return place;
  }

  /** Searches the thread for `query` and goes to the match `index` (newest first). */
  async function goToMatch(user: { click: (el: Element) => Promise<void>; type: (el: Element, text: string) => Promise<void> }, query: string, index = 0) {
    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search messages' }));
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), query);
    const list = await screen.findByRole('region', { name: 'Search messages' });
    await waitFor(() => expect(within(list).queryByText('Searching earlier messages…')).toBeNull());
    await user.click(within(list).getAllByRole('button')[index]);
  }

  it('reads the whole conversation for a search but draws only what the reader had', async () => {
    scrolledDown();
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('message 300');
    expect(rowCount(container)).toBe(50);

    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search messages' }));
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), 'needle');
    const list = await screen.findByRole('region', { name: 'Search messages' });
    await waitFor(() => expect(within(list).getByText('1 match')).toBeInTheDocument());
    await waitFor(() => expect(within(list).queryByText('Searching earlier messages…')).toBeNull());
    // Read for the search, not laid out.
    expect(rowCount(container)).toBe(50);
    expect(container.querySelector('[data-message-id="m100"]')).toBeNull();
  });

  it('draws a match far back as a stretch of its own — not everything down to the newest — and the newest again on the way back', async () => {
    const place = scrolledDown();
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('message 300');
    await goToMatch(user, 'needle');

    // The match, the few before it and a page after it.
    await waitFor(() => expect(container.querySelector('[data-message-id="m100"]')).toBeInTheDocument());
    expect(rowCount(container)).toBe(10 + 1 + 50);
    expect(container.querySelector('[data-message-id="m090"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="m150"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="m151"]')).toBeNull();
    expect(screen.queryByText('message 300')).toBeNull();

    // Down near its foot (once the glide to the match is over), a page more of it is drawn.
    const scroller = container.querySelector('[data-message-id="m100"]')!.closest('[class*="scroller"]')!;
    // 61 rows: 6100 tall, the window's foot 300 from the stretch's.
    place.top = 5_200;
    await waitFor(
      () => {
        fireEvent.scroll(scroller);
        expect(rowCount(container)).toBe(10 + 1 + 50 + 50);
      },
      { timeout: 2000 },
    );

    // The way back down is always offered over it, and draws the newest again (not all between).
    await user.click(screen.getByRole('button', { name: 'Latest messages' }));
    await screen.findByText('message 300');
    expect(rowCount(container)).toBe(50);
    expect(screen.queryByRole('button', { name: 'Latest messages' })).toBeNull();
  });

  it('reaches on to a match a little way back instead', async () => {
    scrolledDown();
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('message 300');
    await goToMatch(user, 'message 211');

    await waitFor(() => expect(container.querySelector('[data-message-id="m211"]')).toBeInTheDocument());
    expect(rowCount(container)).toBe(300 - 200);
    expect(screen.getByText('message 300')).toBeInTheDocument();
  });

  it('goes down to the viewer’s own message sent from a stretch far back', async () => {
    const place = scrolledDown();
    vi.mocked(sendMessage).mockReturnValue(new Promise(() => {}));
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('message 300');
    await goToMatch(user, 'needle');
    await waitFor(() => expect(container.querySelector('[data-message-id="m100"]')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Close search' }));
    // The glide to the match over, the reader near the top of the stretch.
    await new Promise((r) => setTimeout(r, 750));
    place.top = 300;
    fireEvent.change(screen.getByRole('textbox', { name: 'Conversation with alice' }), { target: { value: 'back to now' } });
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('back to now')).toBeInTheDocument();
    expect(screen.getByText('message 300')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="m100"]')).toBeNull();
    // The newest page, and no older one for where the reader stood in the stretch.
    expect(rowCount(container)).toBe(50);
  });

  it('holds the pages read for a quote’s original far back, drawing only around it', async () => {
    scrolledDown();
    const latest = text('m301', 'answering the hay', { sentAt: at(300), replyTo: { id: 'm100', senderId: 'alice', text: 'a needle in the hay' } });
    server.messages = [...long.slice(-49), latest];
    const user = (await import('@testing-library/user-event')).default.setup();
    const { container } = renderWithIntl(thread());
    await screen.findByText('answering the hay');

    await user.click(screen.getByRole('button', { name: /a needle in the hay/ }));
    await waitFor(() => expect(container.querySelector('[data-message-id="m100"]')).toBeInTheDocument());
    // Read a page at a time back to it, but drawn only around it.
    expect(rowCount(container)).toBe(10 + 1 + 50);
    expect(screen.queryByText('answering the hay')).toBeNull();
  });

  it('draws a page of a long list of matches, and more as it is scrolled', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    renderWithIntl(thread());
    await screen.findByText('message 300');
    await user.click(screen.getByRole('button', { name: 'Conversation options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Search messages' }));
    await user.type(screen.getByRole('textbox', { name: 'Search messages' }), 'message');
    const list = await screen.findByRole('region', { name: 'Search messages' });
    await waitFor(() => expect(within(list).getByText('299 matches')).toBeInTheDocument());
    expect(within(list).getAllByRole('button')).toHaveLength(60);
    fireEvent.scroll(list);
    expect(within(list).getAllByRole('button')).toHaveLength(120);
  });
});

