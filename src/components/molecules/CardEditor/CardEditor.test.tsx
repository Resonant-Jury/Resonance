// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import { CardEditor } from './CardEditor';

const push = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  createCardDraft: vi.fn(),
  updateCardDraft: vi.fn(),
  publishCard: vi.fn(),
  deleteCardDraft: vi.fn(),
}));
// The story field is a Tiptap (ProseMirror) editor that doesn't mount cleanly
// in jsdom; mock it at the boundary with a plain textarea that preserves the
// value/onChange/aria-label contract so the editor's surrounding logic
// (publish payload) stays testable.
// The publish panel needs the viewer's profile (card-head preview) and the
// hint system; both are conversation-level boundaries here.
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => ({
    data: { id: 'me', handle: 'my-handle', initials: 'MH', avatarSeed: '3', accentColor: 'var(--accent)' },
  }),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));
vi.mock('@/components/molecules/MarkdownEditor/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { createCardDraft, updateCardDraft, publishCard } from '@/lib/db/firestore/client/cards';

beforeEach(() => {
  vi.mocked(createCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(updateCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(publishCard).mockResolvedValue({ id: 'pub-1' } as never);
});
afterEach(() => vi.clearAllMocks());

describe('CardEditor', () => {
  it('renders the core and story inputs', () => {
    renderWithIntl(<CardEditor locale="en" />);
    expect(screen.getByLabelText('One-line title')).toBeInTheDocument();
    expect(screen.getByLabelText('Story')).toBeInTheDocument();
  });

  it('shows no word-count suggestion for the story body', () => {
    renderWithIntl(<CardEditor locale="en" />);
    const story = screen.getByLabelText('Story');

    fireEvent.change(story, { target: { value: 'short start' } });
    expect(screen.queryByText(/\/300/)).not.toBeInTheDocument();

    fireEvent.change(story, { target: { value: 'x'.repeat(350) } });
    expect(screen.queryByText('The right weight ✿')).not.toBeInTheDocument();
  });

  it('adds suggested tags when the AI tag button is clicked', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ tags: ['記憶', '家庭'] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderWithIntl(<CardEditor locale="en" />);
      await userEvent.click(screen.getByRole('button', { name: 'AI: suggest 2–3' }));
      await waitFor(() => expect(screen.getByText('記憶')).toBeInTheDocument());
      expect(screen.getByText('家庭')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/cards/tags',
        expect.objectContaining({ method: 'POST' })
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('adds a typed tag via the input and hides the AI pill while typing', async () => {
    renderWithIntl(<CardEditor locale="en" />);
    const input = screen.getByLabelText('Type a tag…');

    fireEvent.change(input, { target: { value: '旅行' } });
    // The AI pill steps aside once the user starts typing their own tag…
    expect(screen.queryByRole('button', { name: 'AI: suggest 2–3' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('旅行')).toBeInTheDocument();
    expect(input).toHaveValue('');
    // …and returns once the input is committed/cleared.
    expect(screen.getByRole('button', { name: 'AI: suggest 2–3' })).toBeInTheDocument();
  });

  it('opens the publish panel, then publishes and navigates to the new card', async () => {
    // The panel fetches the insight echo; submit fetches slug + index. All are
    // grace notes the flow must not depend on — fail them all.
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderWithIntl(<CardEditor locale="en" />);

      await userEvent.type(screen.getByLabelText('One-line title'), 'A quiet thought');
      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'Once there was a long enough story to publish.' },
      });

      // The editor's publish button opens the single-screen panel. (Autosave
      // may or may not have persisted the draft by now — either is fine.)
      await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
      expect(await screen.findByText('Publish this card')).toBeInTheDocument();

      // Confirm inside the panel (two "Publish" buttons exist now; the panel's
      // is the last one rendered).
      const buttons = screen.getAllByRole('button', { name: 'Publish' });
      await userEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => expect(createCardDraft).toHaveBeenCalled());
      expect(createCardDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          thoughtCore: 'A quiet thought',
          originalLocale: 'en',
          anonymous: false,
          visibility: 'public',
        })
      );
      expect(publishCard).toHaveBeenCalledWith('draft-1');
      await waitFor(() => expect(push).toHaveBeenCalledWith('/card/pub-1'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('publishes anonymously when the panel toggle is flipped', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderWithIntl(<CardEditor locale="en" />);
      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'A story I would rather not sign.' },
      });

      await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await screen.findByText('Publish this card');

      // WYSIWYG preview: my handle shows until the toggle flips it to the
      // anonymous byline.
      expect(screen.getByText('my-handle')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('switch', { name: 'Publish anonymously' }));
      expect(screen.queryByText('my-handle')).not.toBeInTheDocument();
      expect(screen.getByText('Anonymous')).toBeInTheDocument();

      const buttons = screen.getAllByRole('button', { name: 'Publish' });
      await userEvent.click(buttons[buttons.length - 1]);

      // Autosave may have already created the draft (anonymous: false) before
      // the panel confirmed — what matters is that the publish-path write
      // carried the toggle, whichever call that ended up being.
      await waitFor(() => {
        const writes = [
          ...vi.mocked(createCardDraft).mock.calls.map(([input]) => input),
          ...vi.mocked(updateCardDraft).mock.calls.map(([, patch]) => patch),
        ];
        expect(writes.some((w) => w.anonymous === true)).toBe(true);
      });
      await waitFor(() => expect(publishCard).toHaveBeenCalledWith('draft-1'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('Autosave', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('creates the draft after an editing pause, then updates it in place', async () => {
      vi.useFakeTimers();
      renderWithIntl(<CardEditor locale="en" />);

      fireEvent.change(screen.getByLabelText('One-line title'), {
        target: { value: 'Autosaved thought' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(createCardDraft).toHaveBeenCalledTimes(1);
      expect(createCardDraft).toHaveBeenCalledWith(
        expect.objectContaining({ thoughtCore: 'Autosaved thought', originalLocale: 'en' }),
      );

      // Further edits update the just-created document — no second create.
      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'and then some words' },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      expect(updateCardDraft).toHaveBeenCalledWith(
        'draft-1',
        expect.objectContaining({ story: 'and then some words' }),
      );
      expect(createCardDraft).toHaveBeenCalledTimes(1);
    });

    it('never creates a document for an empty draft', async () => {
      vi.useFakeTimers();
      const { unmount } = renderWithIntl(<CardEditor locale="en" />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      unmount();
      expect(createCardDraft).not.toHaveBeenCalled();
    });

    it('flushes pending edits when the editor unmounts (leaving is safe)', async () => {
      const { unmount } = renderWithIntl(<CardEditor locale="en" />);
      fireEvent.change(screen.getByLabelText('One-line title'), {
        target: { value: 'Backed out right away' },
      });
      // Unmount before the debounce elapses — the flush must still persist.
      unmount();
      await waitFor(() =>
        expect(createCardDraft).toHaveBeenCalledWith(
          expect.objectContaining({ thoughtCore: 'Backed out right away' }),
        ),
      );
    });
  });
});
