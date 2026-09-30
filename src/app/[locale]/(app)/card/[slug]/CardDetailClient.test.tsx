// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { SWRConfig } from 'swr';
import enMessages from '@/messages/en.json';
import { renderWithIntl, screen, waitFor } from '@/../test/render';
import type { CardSeed } from '@/lib/data/cardSeed';
import type { Card, User } from '@/lib/db/types';

// The card page in the browser, on the real data hooks: the client read layer
// (Firestore through the rules), the viewer's blocks and auth are the module
// boundary. Covers how it takes over from the server's HTML (CardSeed).
const mockUseAuth = vi.fn();
vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({
  getCardById: vi.fn(),
  getCardBySlugOrId: vi.fn(),
  resolveCardId: vi.fn(),
  getUserById: vi.fn(),
  getUsersByIds: vi.fn(async () => ({})),
  getRelatedCards: vi.fn(async () => []),
  getResonanceCards: vi.fn(async () => []),
  isConnected: vi.fn(async () => false),
}));
vi.mock('@/lib/db/firestore/client/blocks', () => ({
  getMyBlockedIds: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardLinks', () => ({ listLinksToCard: vi.fn(async () => []) }));
// Leaf components with reads of their own (bookmarks, notes) aren't the subject.
vi.mock('@/components/molecules/CardDetail/ReadAfterArea', () => ({
  ReadAfterArea: () => <div data-testid="read-after-area" />,
}));

import { getCardById, getCardBySlugOrId, getUserById, resolveCardId } from '@/lib/db/firestore/client/reads';
import { getMyBlockedIds } from '@/lib/db/firestore/client/blocks';
import { CardDetailClient, storyGate } from './CardDetailClient';
import { SESSION_MARK_STORAGE_KEY } from './cardHold';
import { SESSION_MARK_KEY } from '@/lib/auth/firebase/client';

const STORY = 'The kettle ticks while the street is still blue.';

function card(id: string, extra: Partial<Card> = {}): Card {
  return {
    id,
    authorId: 'a1',
    slug: 'a-quiet-morning',
    thoughtCore: 'The core thought of this card',
    story: 'The longer story body of this card.',
    tags: ['grief', 'growth'],
    originalLocale: 'en',
    translations: {},
    visibility: 'public',
    publishedAt: new Date('2026-01-01'),
    readCount: 1,
    resonanceCount: 2,
    inviteCount: 0,
    ...extra,
  };
}
function author(): User {
  return {
    id: 'a1',
    handle: '@author',
    region: 'Taipei',
    primaryLocale: 'en',
    autoTranslateTo: [],
    verified: true,
    phoneHash: '',
    avatarSeed: '7',
    initials: 'AU',
    accentColor: 'var(--accent)',
    joinedAt: new Date('2025-01-01'),
    handleChangedAt: new Date('2025-01-01'),
  };
}

/** What the server render hands over for a public card (see CardSeed). */
function seed(extra: { anonymous?: boolean; id?: string } = {}): CardSeed {
  const anonymous = extra.anonymous === true;
  return {
    id: extra.id ?? 'pub1',
    view: {
      card: {
        id: extra.id ?? 'pub1',
        authorId: anonymous ? '' : 'a1',
        slug: 'a-quiet-morning',
        thoughtCore: 'A quiet morning',
        story: STORY,
        tags: ['dawn'],
        media: null,
        originalLocale: 'en',
        referenceCardId: null,
        publishedAt: '2026-03-01T23:30:00.000Z',
        resonanceCount: 0,
        accentHue: 55,
        anonymous,
      },
      author: anonymous
        ? null
        : {
            id: 'a1',
            handle: '@author',
            bio: null,
            region: 'Taipei',
            verified: true,
            avatarSeed: '7',
            avatarUrl: null,
            initials: 'AU',
            accentColor: 'var(--accent)',
          },
    },
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function Providers({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
}

function renderPage(props: { slug?: string; seed?: CardSeed | null } = {}) {
  return renderWithIntl(
    <Providers>
      <CardDetailClient slug={props.slug ?? 'a-quiet-morning'} seed={props.seed ?? null} />
    </Providers>,
  );
}

/** The story is on screen: in the document, and not inside a held (hidden) container. */
function storyVisible(text = STORY): boolean {
  const el = screen.queryByText(text);
  if (!el) return false;
  const held = el.closest('[data-card-hold]') as HTMLElement | null;
  return !held || held.style.visibility !== 'hidden';
}

const signIn = () => window.localStorage.setItem(SESSION_MARK_KEY, JSON.stringify({ uid: 'me', expiresAt: Date.now() + 86_400_000 }));

beforeEach(() => {
  window.localStorage.clear();
  mockUseAuth.mockReturnValue({ user: null, loading: false });
  vi.mocked(getMyBlockedIds).mockResolvedValue(new Set());
  vi.mocked(getUserById).mockResolvedValue(author());
});
afterEach(() => vi.clearAllMocks());

describe('CardDetailClient (no server content)', () => {
  it('renders the fetched card body, author, and tags once loaded', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(card('c1'));
    renderPage({ slug: 'c1' });

    expect(await screen.findByText('The core thought of this card')).toBeInTheDocument();
    expect(screen.getByText('The longer story body of this card.')).toBeInTheDocument();
    // Author appears in both the mobile header and the desktop aside (responsive
    // markup; CSS hides one). At least one should be present.
    expect(screen.getAllByText('@author').length).toBeGreaterThan(0);
    expect(screen.getByText('grief')).toBeInTheDocument();
    expect(getCardBySlugOrId).toHaveBeenCalledWith('c1');
  });

  it('shows the not-found message when the card is missing or not visible', async () => {
    vi.mocked(getCardBySlugOrId).mockResolvedValue(null);
    renderPage({ slug: 'c1' });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
  });

  it('shows a skeleton (neither article nor not-found) while loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    renderPage({ slug: 'c1' });
    expect(screen.queryByText("This card can't be found")).not.toBeInTheDocument();
    expect(screen.queryByText('The core thought of this card')).not.toBeInTheDocument();
  });
});

describe('taking over from the server render', () => {
  it("shows a signed-out reader the server's story at once, and reads the card by its id — no slug lookup", async () => {
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderPage({ seed: seed() });

    expect(storyVisible()).toBe(true);
    await waitFor(() => expect(getCardById).toHaveBeenCalledWith('pub1'));
    expect(getCardBySlugOrId).not.toHaveBeenCalled();
    expect(resolveCardId).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("replaces the server's content with the browser's own read: an edit shows, a card gone private is not found", async () => {
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: 'Edited after the page was cached.' }));
    const edited = renderPage({ seed: seed() });
    expect(await screen.findByText('Edited after the page was cached.')).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
    edited.unmount();
    vi.mocked(getCardById).mockClear();

    // Private now (the rules refuse the read), and the slug still names it.
    vi.mocked(getCardById).mockResolvedValue(null);
    vi.mocked(resolveCardId).mockResolvedValue('pub1');
    renderPage({ seed: seed() });
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
    // The same id again is not read twice.
    expect(getCardById).toHaveBeenCalledTimes(1);
  });

  it('follows a slug that went to another card since the render', async () => {
    vi.mocked(getCardById).mockImplementation(async (id) =>
      id === 'newer' ? card('newer', { thoughtCore: 'The card that has this slug now' }) : null,
    );
    vi.mocked(resolveCardId).mockResolvedValue('newer');
    renderPage({ seed: seed() });
    expect(await screen.findByText('The card that has this slug now')).toBeInTheDocument();
    expect(resolveCardId).toHaveBeenCalledWith('a-quiet-morning');
  });

  it('never shows a signed-in reader the story of an author they blocked, not even while their blocks load', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: true });
    vi.mocked(getCardById).mockResolvedValue(card('pub1', { story: STORY }));
    const blocks = deferred<Set<string>>();
    vi.mocked(getMyBlockedIds).mockReturnValue(blocks.promise);

    const view = renderPage({ seed: seed() });
    // Auth still restoring: held.
    expect(screen.getByText(STORY)).toBeInTheDocument();
    expect(storyVisible()).toBe(false);

    // Signed in, block list on its way: still held.
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Providers>
          <CardDetailClient slug="a-quiet-morning" seed={seed()} />
        </Providers>
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(storyVisible()).toBe(false);

    await act(async () => blocks.resolve(new Set(['a1'])));
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    expect(screen.queryByText(STORY)).not.toBeInTheDocument();
  });

  it('shows a signed-in reader the story once their block list is known and clear of the author', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const blocks = deferred<Set<string>>();
    vi.mocked(getMyBlockedIds).mockReturnValue(blocks.promise);

    renderPage({ seed: seed() });
    expect(storyVisible()).toBe(false);
    expect(screen.getByText(STORY).closest('[data-card-hold]')).toHaveAttribute('aria-busy', 'true');
    await act(async () => blocks.resolve(new Set(['someone-else'])));
    await waitFor(() => expect(storyVisible()).toBe(true));
  });

  it("holds an anonymous card from the server until the browser's own read names its author", async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: { id: 'me' }, loading: false });
    vi.mocked(getMyBlockedIds).mockResolvedValue(new Set(['secret']));
    const read = deferred<Card | null>();
    vi.mocked(getCardById).mockReturnValue(read.promise);

    renderPage({ seed: seed({ anonymous: true }) });
    await waitFor(() => expect(getMyBlockedIds).toHaveBeenCalled());
    expect(storyVisible()).toBe(false);

    // The read comes back: written by someone this reader blocked.
    await act(async () => read.resolve(card('pub1', { authorId: 'secret', anonymous: true, story: STORY })));
    expect(await screen.findByText("This card can't be found")).toBeInTheDocument();
    // Nor was the anonymous author's profile ever fetched.
    expect(getUserById).not.toHaveBeenCalled();
  });

  it('shows the story when this browser remembers a sign-in the SDK no longer has', async () => {
    signIn();
    mockUseAuth.mockReturnValue({ user: null, loading: false });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    renderPage({ seed: seed() });
    await waitFor(() => expect(storyVisible()).toBe(true));
  });

  it('hydrates the server HTML without a mismatch, then lets a signed-out reader keep reading', async () => {
    // The server render: auth unknown, no browser.
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    vi.mocked(getCardById).mockReturnValue(new Promise(() => {}));
    const ui = (
      <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
        <Providers>
          <CardDetailClient slug="a-quiet-morning" seed={seed()} />
        </Providers>
      </NextIntlClientProvider>
    );
    // Rendered on a server in UTC, hydrated by a reader in Taipei — where the
    // card was published on another day (23:30 UTC).
    const tz = process.env.TZ;
    process.env.TZ = 'UTC';
    const container = document.createElement('div');
    container.innerHTML = renderToString(ui);
    document.body.appendChild(container);
    process.env.TZ = 'Asia/Taipei';
    expect(container.textContent).toContain(STORY);
    expect(container.querySelector('[data-card-hold]')).not.toBeNull();

    const recoverable = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, ui, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/hydrat/i);
    consoleError.mockRestore();

    // After hydration, a signed-out browser releases the hold at once, and the
    // date turns to the reader's own.
    expect(container.querySelector('[data-card-hold]')).toBeNull();
    expect(container.textContent).toContain(STORY);
    expect(container.textContent).toContain('Mar 2');
    act(() => root.unmount());
    container.remove();
    process.env.TZ = tz;
  });
});

describe('storyGate', () => {
  const base = { signedInHere: true, authLoading: false, viewerId: 'me', blocked: new Set<string>(), authorId: 'a1', failed: false };
  it('lets the reader see their own card without waiting on anything', () => {
    expect(storyGate({ ...base, authorId: 'me', blocked: undefined })).toBe('show');
  });
  it('is unknown on the server and during hydration unless the author is known blocked', () => {
    expect(storyGate({ ...base, signedInHere: null, viewerId: undefined, blocked: undefined })).toBe('unknown');
  });
  it('gives up holding an anonymous card when the browser read failed', () => {
    expect(storyGate({ ...base, authorId: '', failed: false })).toBe('hold');
    expect(storyGate({ ...base, authorId: '', failed: true })).toBe('show');
  });
});

describe('the pre-paint hold script', () => {
  it('looks for the same session mark the auth client writes', () => {
    expect(SESSION_MARK_STORAGE_KEY).toBe(SESSION_MARK_KEY);
  });
});
