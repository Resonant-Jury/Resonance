// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderWithIntl, screen, fireEvent, userEvent, waitFor, within } from '@/../test/render';
import { ReadAfterArea } from './ReadAfterArea';
import actionStyles from './CardViewerActions.module.css';

/**
 * The note's words as a screen this wide shows them (jsdom applies no CSS
 * modules: the rule CardViewerActions.module.css sets at 640px, written out).
 */
function screenIs(width: 'phone' | 'desktop') {
  document.getElementById('note-words')?.remove();
  const style = document.createElement('style');
  style.id = 'note-words';
  style.textContent = `.${width === 'phone' ? actionStyles.wide : actionStyles.narrow} { display: none; }`;
  document.head.appendChild(style);
}

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
  // The resonate picker's list: the viewer's published shelf.
  useMyCardBox: (shelf: string | null) => ({
    data: shelf ? { cards: [{ id: 'mine-1', thoughtCore: 'A card of mine', visibility: 'public', publishedAt: new Date() }], authors: {} } : undefined,
    mutate: vi.fn(),
  }),
}));
vi.mock('@/lib/db/firestore/client/notes', () => ({
  sendNote: vi.fn(),
  NOTE_MAX_LENGTH: 2000,
}));
vi.mock('@/lib/db/firestore/client/bookmarks', () => ({
  isBookmarked: vi.fn().mockResolvedValue(false),
  toggleBookmark: vi.fn().mockResolvedValue(true),
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
  screenIs('desktop');
  mockUseAuth.mockReturnValue({ user: { id: 'viewer' }, loading: false });
  mockUseMyResonance.mockReturnValue({ data: null, mutate: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

const user = () => userEvent.setup({ pointerEventsCheck: 0 });

describe('ReadAfterArea', () => {
  // One bar at every width (a phone's too, in one row): the verb solid, the
  // note and the bookmark tonal.
  it('renders the three actions once, in one bar: resonate, the note, the bookmark', async () => {
    renderWithIntl(
      <ReadAfterArea cardId="c1" cardTitle="Title" author={author} coreInsight="ins" />,
    );
    const bar = screen.getByRole('group');
    expect(within(bar).getAllByRole('button')).toHaveLength(3);
    expect(within(bar).getByRole('button', { name: /Resonate/ })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Send the author a little note' })).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Bookmark' })).toBeInTheDocument();
    // The bookmark's state is read once the bar is up.
    await act(async () => {});
  });

  // WCAG 2.5.3 (label in name): a phone's row shows the note's short words,
  // and its name is those words — a voice control user says what they see.
  it('names the note by the words it shows: in full on a desktop, short on a phone', async () => {
    screenIs('phone');
    const { unmount } = renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    expect(screen.getByRole('button', { name: 'Send a note' })).toBeInTheDocument();
    await act(async () => {});
    unmount();

    screenIs('desktop');
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    expect(screen.getByRole('button', { name: 'Send the author a little note' })).toBeInTheDocument();
    await act(async () => {});
  });

  // The short words belong to the row that spans a phone's column: below the
  // width the bar spreads at, never in a bar standing at its own width.
  it('switches to the short words at the width the bar spreads across the column', () => {
    const css = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
    const widthOf = (text: string, rule: RegExp) =>
      [...text.matchAll(/@media \(max-width: (\d+)px\)\s*\{([\s\S]*?)\n\}/g)].find(([, , body]) => rule.test(body))?.[1];
    const short = widthOf(css('src/components/molecules/CardDetail/CardViewerActions.module.css'), /\.narrow\s*\{\s*display: inline/);
    const spread = widthOf(css('src/components/molecules/SegmentedActionBar/SegmentedActionBar.module.css'), /\.bar\s*\{[^}]*width: 100%/);
    expect(short).toBeDefined();
    expect(short).toBe(spread);
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

  it('opens the resonate picker on Resonate: write a new card, or pick one already written', async () => {
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    await user().click(screen.getAllByRole('button', { name: /Resonate/ })[0]);

    expect(await screen.findByRole('dialog', { name: 'Resonate with this card' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A card of mine' })).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    // The first row is the writer, as the button used to be.
    await user().click(screen.getByRole('button', { name: /Write a new card/ }));
    expect(mockPush).toHaveBeenCalledWith('/write?referenceCardId=c1');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('sends signed-out visitors to /signin instead of opening the picker', async () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getAllByRole('button', { name: /Resonate/ })[0]);
    expect(mockPush).toHaveBeenCalledWith('/signin');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('says a published resonance is done, and opens it', async () => {
    mockUseMyResonance.mockReturnValue({
      data: { id: 'mine-9', slug: 'my-answer', publishedAt: new Date(), anonymous: false, authorId: 'viewer' },
    });
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getAllByRole('button', { name: /Resonated/ })[0]);
    expect(mockPush).toHaveBeenCalledWith('/card/my-answer');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('takes a resonance still in draft back to the writer', async () => {
    mockUseMyResonance.mockReturnValue({ data: { id: 'draft-9', publishedAt: null } });
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getAllByRole('button', { name: /Edit/ })[0]);
    expect(mockPush).toHaveBeenCalledWith('/write/draft-9');
  });

  it('upgrades a long note by navigating to the write page with the text in searchParams', async () => {
    renderWithIntl(<ReadAfterArea cardId="c1" cardTitle="Title" author={author} />);
    await user().click(screen.getByRole('button', { name: 'Send the author a little note' }));

    const long = 'b'.repeat(220);
    fireEvent.change(screen.getByPlaceholderText('Something you want to tell the author…'), {
      target: { value: long },
    });
    await user().click(
      screen.getByRole('button', { name: 'Want to turn this into a resonance card?' }),
    );

    expect(mockPush).toHaveBeenCalledWith(`/write?referenceCardId=c1&story=${encodeURIComponent(long)}`);
  });
});
