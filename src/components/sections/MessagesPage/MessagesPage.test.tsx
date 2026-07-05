// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SWRConfig } from 'swr';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import type { Conversation, Message, User } from '@/lib/db/types';
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
const mockUseThread = vi.fn();
const mockUseMyProfile = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useConversations: () => mockUseConversations(),
  useThread: (pairId: string | undefined) => mockUseThread(pairId),
  useMyProfile: () => mockUseMyProfile(),
}));

const mockGetUserByHandle = vi.fn();
const mockIsConnected = vi.fn();
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getUserByHandle: (h: string) => mockGetUserByHandle(h),
  isConnected: () => mockIsConnected(),
}));

const mockOpenConversation = vi.fn();
const mockSendMessage = vi.fn();
const mockGetConversation = vi.fn();
const mockNotifyStarted = vi.fn();
vi.mock('@/lib/db/firestore/client/messages', () => ({
  MESSAGE_MAX_LENGTH: 2000,
  conversationId: (a: string, b: string) => [a, b].sort().join('_'),
  getConversation: () => mockGetConversation(),
  markConversationRead: vi.fn().mockResolvedValue(undefined),
  notifyConversationStarted: (...args: unknown[]) => mockNotifyStarted(...args),
  openConversation: (...args: unknown[]) => mockOpenConversation(...args),
  sendMessage: (...args: unknown[]) => mockSendMessage(...args),
}));

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
vi.mock('./MessageCardRef', () => ({
  MessageCardRef: ({ cardId }: { cardId: string }) => (
    <div data-testid="shared-card">{cardId}</div>
  ),
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
  mockUseThread.mockReturnValue({ messages: [], ready: false, error: null });
  mockGetUserByHandle.mockResolvedValue(alice);
  mockIsConnected.mockResolvedValue(true);
  mockGetConversation.mockResolvedValue(conversation());
  mockOpenConversation.mockResolvedValue('alice_me');
  mockSendMessage.mockResolvedValue('m-new');
});
afterEach(() => vi.clearAllMocks());

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
    mockUseThread.mockReturnValue({ messages, ready: true, error: null });

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByText('hello from alice')).toBeInTheDocument());
    expect(screen.getByText('hi back')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'a reply' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice_me', 'a reply', expect.anything()),
    );
    // Lazy-create runs before every send (idempotent no-op afterwards).
    expect(mockOpenConversation).toHaveBeenCalledWith('alice');
    // The conversation already has messages — no bell ping for replies.
    expect(mockNotifyStarted).not.toHaveBeenCalled();
  });

  it('rings the recipient bell exactly on the first message of a conversation', async () => {
    mockGetConversation.mockResolvedValue(null);
    mockUseThread.mockReturnValue({ messages: [], ready: false, error: null });

    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByPlaceholderText('Write a message…')).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText('Write a message…'), {
      target: { value: 'first hello' },
    });
    await userEvent.setup({ pointerEventsCheck: 0 }).click(
      screen.getByRole('button', { name: 'Send' }),
    );
    await waitFor(() =>
      expect(mockSendMessage).toHaveBeenCalledWith('alice_me', 'first hello', expect.anything()),
    );
    expect(mockNotifyStarted).toHaveBeenCalledWith('alice', 'me-handle');
  });

  it('blocks the composer for strangers and offers the profile instead', async () => {
    mockIsConnected.mockResolvedValue(false);
    mockGetConversation.mockResolvedValue(null);
    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() =>
      expect(
        screen.getByText("You can only message people you're connected with."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByPlaceholderText('Write a message…')).not.toBeInTheDocument();
  });

  it('carries a note reply as a quoted reference on the sent message', async () => {
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
        'alice_me',
        'thanks for the note',
        expect.objectContaining({ noteRef: { noteId: 'note-1', cardId: 'card-1' } }),
      ),
    );
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
        'alice_me',
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
    mockUseThread.mockReturnValue({ messages, ready: true, error: null });
    renderPage(<MessagesPage activeHandle="alice" />);
    await waitFor(() => expect(screen.getByTestId('shared-card')).toHaveTextContent('card-77'));
    expect(screen.getByText('In reply to your note')).toBeInTheDocument();
  });
});
