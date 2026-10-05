// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { act, cleanup, renderWithIntl, screen, fireEvent, waitFor, userEvent, within } from '@/../test/render';
import type { Conversation, Message, User } from '@/lib/db/types';
import { forgetOutboxes } from '@/lib/data/thread';
import { MessagesPage } from './MessagesPage';

/** ThreadView fetches through raw useSWR — isolate the cache per test. */
function renderPage(ui: React.ReactElement) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
}

// --- boundary mocks ----------------------------------------------------------
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));

const mockUseConversations = vi.fn();
const mockUseMyProfile = vi.fn();
const mockUseCardSummaries = vi.fn((_keys: string[]): unknown => null);
vi.mock('@/lib/data/hooks', () => ({
  useConversations: () => mockUseConversations(),
  useMyProfile: () => mockUseMyProfile(),
  useMyBlockedIds: () => ({ data: new Set<string>() }),
  useCardSummaries: (keys: string[]) => mockUseCardSummaries(keys),
}));

const mockBlockUser = vi.fn();
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  blockUser: (uid: string) => mockBlockUser(uid),
  unblockUser: vi.fn(),
}));
const mockSubmitReport = vi.fn();
vi.mock('@/lib/db/firestore/client/reports', () => ({
  REPORT_REASONS: ['spam', 'harassment', 'other'],
  REPORT_DETAIL_MAX: 1000,
  submitReport: (input: unknown) => mockSubmitReport(input),
}));

const mockGetUserByHandle = vi.fn();
const mockIsConnected = vi.fn();
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: (h: string) => mockGetUserByHandle(h),
  isConnected: () => mockIsConnected(),
}));

const mockSendMessage = vi.fn();
const mockGetConversation = vi.fn();
const mockMarkRead = vi.fn();
const mockDeleteConversation = vi.fn();
// The open conversation as the server holds it: its listener hears `messages`
// at once, and again on `deliver`.
const server = vi.hoisted(() => ({
  messages: [] as Message[],
  listening: [] as string[],
  emit: null as ((window: unknown) => void) | null,
  windowOf: (messages: Message[]) => ({
    entries: [...messages].reverse().map((message) => ({ message, cursor: { seconds: 0, nanoseconds: 0, id: message.id } })),
    fromCache: false,
  }),
}));
vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  conversationId: (a: string, b: string) => [a, b].sort().join('_'),
  deleteConversation: (pairId: string) => mockDeleteConversation(pairId),
  getConversation: () => mockGetConversation(),
  markConversationRead: (pairId: string) => mockMarkRead(pairId),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  listenThread: (pairId: string, onWindow: (window: unknown) => void) => {
    server.listening.push(pairId);
    server.emit = onWindow;
    onWindow(server.windowOf(server.messages));
    return () => {};
  },
  getOlderMessages: async () => [],
}));
const deliver = (messages: Message[]) => act(() => server.emit!(server.windowOf(messages)));

// The card picker + the shared-card embed touch further read paths; stub them
// down to their contract so the thread tests stay about attach/send/render.
vi.mock('@/components/molecules/MarkdownEditor/InsertCardModal', () => ({
  InsertCardModal: ({
    open,
    onPick,
  }: {
    open: boolean;
    onPick: (card: { id: string; thoughtCore: string }) => void;
  }) =>
    open ? (
      <button onClick={() => onPick({ id: 'card-42', thoughtCore: 'A shared thought' })}>
        pick-card
      </button>
    ) : null,
}));
// A shared card is looked up by the thread (a card the viewer can't see resolves to an error).
vi.mock('@/components/molecules/EmbedStoryCard/useCardEmbed', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/molecules/EmbedStoryCard/useCardEmbed')>()),
  useCardEmbed: (href: string) =>
    href === '/card/card-77'
      ? {
          status: 'ready',
          card: {
            id: 'card-77',
            authorId: 'alice',
            slug: 'a-walk-at-dawn',
            thoughtCore: 'A walk at dawn',
            story: 'The street was still asleep.',
            tags: [],
            originalLocale: 'en',
            translations: {},
            visibility: 'public',
            publishedAt: new Date('2026-02-01'),
            readCount: 0,
            resonanceCount: 0,
            inviteCount: 0,
            anonymous: false,
            summary: { readMinutes: 3 },
          },
          author: person('alice', 'alice'),
        }
      : { status: 'error' },
}));

function person(id: string, handle: string): User {
  return {
    id,
    handle,
    region: 'TW',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: false,
    phoneHash: '',
    avatarSeed: '7',
    initials: handle.slice(0, 2).toUpperCase(),
    accentColor: 'var(--color-sage)',
    joinedAt: new Date(),
    handleChangedAt: new Date(),
  };
}

const viewer = { id: 'me', handle: 'me-handle' };
const alice = person('alice', 'alice');
const bob = person('bob', 'bob');

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'alice_me',
    participants: ['alice', 'me'],
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessage: { text: 'see you soon', senderId: 'alice', sentAt: new Date() },
    unread: { me: 2, alice: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  mockUseMyProfile.mockReturnValue({ data: viewer });
  mockUseAuth.mockReturnValue({ user: viewer, loading: false });
  mockUseConversations.mockReturnValue({
    data: {
      conversations: [conversation()],
      people: { alice, bob },
      connectedWithoutConversation: [bob],
      unreadTotal: 2,
    },
  });
  server.messages = [];
  server.listening = [];
  mockGetUserByHandle.mockResolvedValue(alice);
  mockIsConnected.mockResolvedValue(true);
  mockGetConversation.mockResolvedValue(conversation());
  mockSendMessage.mockResolvedValue({ conversationId: 'alice_me', id: 'm-new' });
  mockMarkRead.mockResolvedValue(undefined);
  mockDeleteConversation.mockResolvedValue(undefined);
  mockBlockUser.mockResolvedValue(undefined);
  mockSubmitReport.mockResolvedValue(undefined);
});
afterEach(() => {
  // Unmount first: emptying the outboxes under a thread still drawn would redraw it outside act().
  cleanup();
  vi.clearAllMocks();
  mockUseCardSummaries.mockImplementation(() => null);
  forgetOutboxes();
});

describe('MessagesPage list', () => {
  it('shows conversations with preview + unread badge, and connected people without one', () => {
    renderPage(<MessagesPage />);
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('see you soon')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // bob has no conversation yet — listed under the starter section
    expect(screen.getByText('Connected — no conversation yet')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('redirects signed-out visitors to /signin', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderPage(<MessagesPage />);
    expect(mockPush).toHaveBeenCalledWith('/signin');
  });
});

describe('MessagesPage thread', () => {
  it('renders incoming and own messages and sends a reply', async () => {
    const messages: Message[] = [
      { id: 'm1', senderId: 'alice', text: 'hello from alice', sentAt: new Date() },
      { id: 'm2', senderId: 'me', text: 'hi back', sentAt: new Date() },
    ];
    server.messages = messages;

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByText('hello from alice')).toBeInTheDocument());
    expect(screen.getByText('hi back')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'a reply' },
    });
    // The send button wakes once there is something to send.
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('data-enabled');
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    // One server call, addressed to the person (the server opens the
    // conversation and decides whether the bell rings).
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice', 'a reply', expect.anything()),
    );
    // The composer is free again at once, and the message shows while it is on its way.
    expect(screen.getByPlaceholderText('Write a message…')).toHaveValue('');
    expect(screen.getByText('a reply')).toBeInTheDocument();
  });

  it('sends the first message of a conversation that does not exist yet', async () => {
    mockGetConversation.mockResolvedValue(null);
    // The server opens the conversation with the first message.
    mockSendMessage.mockImplementation(async () => {
      mockGetConversation.mockResolvedValue(conversation());
      return { conversationId: 'alice_me', id: 'm-new' };
    });

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument());
    // Nothing to listen to before the first message makes the conversation.
    expect(server.listening).not.toContain('alice_me');

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'first hello' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice', 'first hello', expect.anything()),
    );
    // Once the server took it, the conversation is there to listen to.
    await waitFor(() => expect(server.listening).toContain('alice_me'));
  });

  it('blocks the composer for strangers and offers the profile instead', async () => {
    mockIsConnected.mockResolvedValue(false);
    mockGetConversation.mockResolvedValue(null);
    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() =>
      expect(
        screen.getByText("You can only message people you're connected with"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument();
  });

  /** The thread's card lookup, answering for the card a note was left on. */
  const noteCard = (anonymous: boolean) =>
    mockUseCardSummaries.mockImplementation((keys: string[]) =>
      keys.includes('card-1')
        ? {
            status: 'ready',
            cards: { cards: [{ id: 'card-1', authorId: 'me', thoughtCore: 'My card', anonymous }], authors: {} },
            asked: new Set(keys),
            failed: new Set(),
          }
        : null,
    );

  // An older note (left before notes came into threads) isn't in the conversation: its quote rides the reply.
  it('carries an older note’s reply as a quoted reference on the sent message', async () => {
    noteCard(false);
    renderPage(
      <MessagesPage
        activeHandle="alice"
        replyNote={{ noteId: 'note-1', cardId: 'card-1' }}
      />,
    );
    // The quote chip appears above the composer, ready to ride the next send.
    await waitFor(() => expect(screen.getByText('In reply to your note')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'thanks for the note' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        'alice',
        'thanks for the note',
        expect.objectContaining({ noteRef: { noteId: 'note-1', cardId: 'card-1' } }),
      ),
    );
  });

  // Answering a note on an anonymous card with its quote would tell the writer whose card it was.
  it('answers an older note on an anonymous card without its quote', async () => {
    noteCard(true);
    renderPage(<MessagesPage activeHandle="alice" replyNote={{ noteId: 'note-1', cardId: 'card-1' }} />);
    await waitFor(() => expect(mockUseCardSummaries).toHaveBeenCalledWith(expect.arrayContaining(['card-1'])));
    fireEvent.change(await screen.findByPlaceholderText('Write a message…'), { target: { value: 'thank you' } });
    expect(screen.queryByText('In reply to your note')).not.toBeInTheDocument();
    await userEvent.setup({ pointerEventsCheck: 0 }).click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSendMessage).toHaveBeenCalledWith('alice', 'thank you', expect.objectContaining({ noteRef: undefined })));
  });

  it('attaches a picked card and sends it as a cardRef', async () => {
    renderPage(<MessagesPage activeHandle="alice" />);
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    await waitFor(() => expect(screen.getByLabelText('Attach a card')).toBeInTheDocument());

    await u.click(screen.getByLabelText('Attach a card'));
    await u.click(await screen.findByRole('button', { name: 'pick-card' }));
    // The attached card shows as a chip before sending.
    expect(screen.getByText('A shared thought')).toBeInTheDocument();

    await u.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith(
        'alice',
        '',
        expect.objectContaining({ cardRef: 'card-42' }),
      ),
    );
  });

  it('renders a shared card and a note-reply quote in the thread', async () => {
    const messages: Message[] = [
      { id: 'm1', senderId: 'alice', text: '', sentAt: new Date(), cardRef: 'card-77' },
      {
        id: 'm2',
        senderId: 'me',
        text: 'replying',
        sentAt: new Date(),
        noteRef: { cardId: 'card-9', noteId: 'note-9' },
      },
    ];
    server.messages = messages;
    renderPage(<MessagesPage activeHandle="alice" />);
    // The card sits inside its bubble as a shared post: who wrote it, its title, the 共振 source line.
    const card = await screen.findByRole('link', { name: /A walk at dawn/ });
    expect(card).toHaveAttribute('href', '/card/a-walk-at-dawn');
    expect(card).toHaveTextContent('alice');
    expect(card).toHaveTextContent('Resonance · 3 min');
    expect(card).toHaveTextContent('The street was still asleep.');
    expect(screen.getByText('In reply to your note')).toBeInTheDocument();
  });
});

// App Store 1.2: every conversation needs a way to report and block.
describe('MessagesPage thread safety menu', () => {
  it('blocks the other person after confirming', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Block' }));

    expect(await screen.findByText('Block alice?')).toBeInTheDocument();
    expect(mockBlockUser).not.toHaveBeenCalled();
    // Blocking can be undone, so the verb is solid — not the red of a deletion.
    const block = screen.getByRole('button', { name: 'Block' });
    expect(block).toHaveAttribute('data-variant', 'solid');
    await u.click(block);
    await waitFor(() => expect(mockBlockUser).toHaveBeenCalledWith('alice'));
  });

  it('deletes the conversation only from a red verb, and keeps it on a plain-text cancel', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Delete conversation' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete this conversation?' });
    const keep = within(dialog).getByRole('button', { name: 'Keep it' });
    const del = within(dialog).getByRole('button', { name: 'Delete' });
    expect(keep).toHaveAttribute('data-variant', 'text');
    expect(del).toHaveAttribute('data-variant', 'danger');

    await u.click(keep);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Delete this conversation?' })).toBeNull());
    expect(mockDeleteConversation).not.toHaveBeenCalled();

    await u.click(screen.getByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Delete conversation' }));
    await u.click(
      within(await screen.findByRole('dialog', { name: 'Delete this conversation?' })).getByRole('button', {
        name: 'Delete',
      }),
    );
    await waitFor(() => expect(mockDeleteConversation).toHaveBeenCalledWith('alice_me'));
  });

  it('files a report about the conversation, with the chosen reason and details', async () => {
    const u = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage(<MessagesPage activeHandle="alice" />);
    await u.click(await screen.findByRole('button', { name: 'Conversation options' }));
    await u.click(screen.getByRole('menuitem', { name: 'Report this conversation' }));

    fireEvent.change(await screen.findByLabelText('Details (optional)'), {
      target: { value: 'Keeps sending links' },
    });
    const submit = screen.getByRole('button', { name: 'Send report' });
    // Inside the modal the verb is solid and cancel plain text: no pen lines.
    expect(submit).toHaveAttribute('data-variant', 'solid');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveAttribute('data-variant', 'text');
    await u.click(submit);

    await waitFor(() =>
      // The server finds who is responsible: the other participant.
      expect(mockSubmitReport).toHaveBeenCalledWith({
        targetType: 'message',
        targetId: 'alice_me',
        reason: 'spam',
        detail: 'Keeps sending links',
        contextId: 'alice_me',
      }),
    );
    expect(await screen.findByText('Thanks for telling us')).toBeInTheDocument();
    // The thank-you's Close (the modal's own ✕ shares its name) is the verb: solid.
    const close = screen.getAllByRole('button', { name: 'Close' }).find((b) => b.hasAttribute('data-variant'));
    expect(close).toHaveAttribute('data-variant', 'solid');
    // Not blocked unless the "also block" switch was turned on.
    expect(mockBlockUser).not.toHaveBeenCalled();
  });
});

// The open thread listens to its newest 50 messages. Past 50, a new message
// pushes the oldest out, so the count stays 50 — the thread must still notice
// it: clear the unread badge and scroll to it.
describe('MessagesPage thread past 50 messages', () => {
  const at = (i: number) => new Date(2026, 0, 1, 0, i);
  const window50 = (from: number, senderOfLast = 'me'): Message[] =>
    Array.from({ length: 50 }, (_, k) => {
      const i = from + k;
      return { id: `m${i}`, senderId: k === 49 ? senderOfLast : 'me', text: `message ${i}`, sentAt: at(i) };
    });

  it('marks a new incoming message read and scrolls to it, though the count stays 50', async () => {
    mockGetConversation.mockResolvedValue(conversation({ unread: { me: 0, alice: 0 } }));
    server.messages = window50(0);
    const scrolls = vi.fn();
    const scrollTop = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')!;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get: () => 0,
      set: scrolls,
    });
    try {
      renderPage(<MessagesPage activeHandle="alice" />);
      await waitFor(() => expect(screen.getByText('message 49')).toBeInTheDocument());
      expect(server.listening).toEqual(['alice_me']);
      expect(mockMarkRead).not.toHaveBeenCalled(); // nothing unread yet
      const scrollsBefore = scrolls.mock.calls.length;

      // alice writes: the oldest message drops out of the window, the newest is hers.
      deliver(window50(1, 'alice'));

      await waitFor(() => expect(screen.getByText('message 50')).toBeInTheDocument());
      // The thread keeps the one that slid out of the window.
      expect(screen.getByText('message 0')).toBeInTheDocument();
      await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('alice_me'));
      expect(scrolls.mock.calls.length).toBeGreaterThan(scrollsBefore);
    } finally {
      Object.defineProperty(Element.prototype, 'scrollTop', scrollTop);
    }
  });
});
