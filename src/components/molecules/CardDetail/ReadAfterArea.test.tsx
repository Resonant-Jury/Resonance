// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, fireEvent, userEvent } from '@/../test/render';
import { ReadAfterArea } from './ReadAfterArea';

// Boundary mocks: auth, navigation, data hooks, write modules, hints. The
// CardEditor itself (Tiptap-based) is stubbed — these tests exercise the
// read-after area's composition and the up/downgrade hand-offs around it.
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
}));
const mockUseMyResonance = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({ data: { id: 'viewer', handle: 'viewer-handle' } }),
  useMyResonance: () => mockUseMyResonance(),
}));
vi.mock('@/lib/db/firestore/client/notes', () => ({
  sendNote: vi.fn(),
  NOTE_MAX_LENGTH: 2000,
}));
vi.mock('@/lib/db/firestore/client/bookmarks', () => ({
  isBookmarked: vi.fn().mockResolvedValue(false),
  toggleBookmark: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/lib/db/firestore/client/resonances', () => ({
  notifyResonance: vi.fn(),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));
// Stub editor: reveals the initial story it was mounted with and lets a test
// feed live story text up through onStoryChange (for the downgrade hand-off).
vi.mock('@/components/molecules/CardEditor/CardEditor', () => ({
  CardEditor: ({
    initial,
    onStoryChange,
  }: {
    initial?: { story?: string };
    onStoryChange?: (s: string) => void;
  }) => (
    <div data-testid="card-editor">
      <span data-testid="editor-initial-story">{initial?.story ?? ''}</span>
      <button onClick={() => onStoryChange?.('an unfinished public draft')}>type-story</button>
    </div>
  ),
}));

const author = { id: 'author-1', handle: '@a', initials: 'A', accentColor: 'var(--accent)' };

beforeEach(() => {
  mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, loading: false });
  mockUseMyResonance.mockReturnValue({ data: null, mutate: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

describe('ReadAfterArea', () => {
  it('renders the three-action hierarchy: resonate button, note link, bookmark icon', () => {
    renderWithIntl(
      <ReadAfterArea cardId="c1" cardTitle="Title" author={author} coreInsight="ins" />,
    );
    expect(screen.getByRole('button', { name: /Resonate/ })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send the author a little note' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
  });

  it('renders nothing at all for the card author', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'author-1' }, loading: false });
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sends signed-out visitors to /signin instead of opening the note composer', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getByRole('button', { name: 'Send the author a little note' }));
    expect(mockPush).toHaveBeenCalledWith('/signin');
    expect(screen.queryByPlaceholderText('Something you want to tell the author…')).not.toBeInTheDocument();
  });

  it('shows the AI opener (core insight) above a fresh resonance editor', async () => {
    renderWithIntl(
      <ReadAfterArea cardId="c1" cardTitle="Title" author={author} coreInsight="loss teaches" />,
    );
    await user().click(screen.getByRole('button', { name: /Resonate/ }));
    expect(screen.getByTestId('card-editor')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The insight of this card is "loss teaches". Have you lived something similar — or the exact opposite?',
      ),
    ).toBeInTheDocument();
  });

  it('upgrades a long note into the resonance editor, carrying the text', async () => {
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getByRole('button', { name: 'Send the author a little note' }));

    const long = 'b'.repeat(220);
    fireEvent.change(screen.getByPlaceholderText('Something you want to tell the author…'), {
      target: { value: long },
    });
    await user().click(
      screen.getByRole('button', { name: 'Want to turn this into a resonance card?' }),
    );

    // Note composer closes; resonance editor opens seeded with the note text.
    expect(
      screen.queryByPlaceholderText('Something you want to tell the author…'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-initial-story')).toHaveTextContent(long);
  });

  it('downgrades an open resonance draft into the note composer, carrying the text', async () => {
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getByRole('button', { name: /Resonate/ }));

    // Simulate typing in the (stubbed) editor, then take the quiet exit.
    await user().click(screen.getByRole('button', { name: 'type-story' }));
    await user().click(
      screen.getByRole('button', {
        name: 'Not ready to go public? Send it to the author as a note instead.',
      }),
    );

    expect(screen.queryByTestId('card-editor')).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Something you want to tell the author…'),
    ).toHaveValue('an unfinished public draft');
  });
});
