// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import en from '@/messages/en.json';
import { CardEditor } from './CardEditor';

const push = vi.fn();
const back = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, back }),
}));
vi.mock('@/lib/db/firestore/client/cards', () => ({
  createCardDraft: vi.fn(),
  updateCardDraft: vi.fn(),
  publishCard: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/cardEdits', () => ({
  savePendingCardEdit: vi.fn(),
  applyPendingCardEdit: vi.fn(),
  discardPendingCardEdit: vi.fn(),
}));
vi.mock('@/lib/db/firestore/client/revalidate', () => ({
  requestRevalidate: vi.fn(),
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
import {
  applyPendingCardEdit,
  discardPendingCardEdit,
  savePendingCardEdit,
} from '@/lib/db/firestore/client/cardEdits';

/** A card that is already out in the world, opened for revision. */
const livePost = {
  id: 'card-1',
  slug: 'a-quiet-thought',
  publishedAt: new Date('2026-01-02'),
  thoughtCore: 'A quiet thought',
  story: 'The published story.',
  tags: ['memory'],
  visibility: 'public' as const,
  anonymous: false,
};

beforeEach(() => {
  vi.mocked(createCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(updateCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
  vi.mocked(publishCard).mockResolvedValue({ id: 'pub-1' } as never);
  vi.mocked(savePendingCardEdit).mockResolvedValue(undefined);
  vi.mocked(discardPendingCardEdit).mockResolvedValue(undefined);
  vi.mocked(applyPendingCardEdit).mockResolvedValue({
    id: 'card-1',
    slug: 'a-quiet-thought',
  } as never);
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

    it('tells the writer their draft is safe, up where they can see it', async () => {
      const onSaveStatusChange = vi.fn();
      renderWithIntl(<CardEditor locale="en" onSaveStatusChange={onSaveStatusChange} />);
      // Before anything is typed the promise is stated, not just implied.
      await waitFor(() =>
        expect(onSaveStatusChange).toHaveBeenCalledWith(en.write.autosaveHint),
      );

      fireEvent.change(screen.getByLabelText('One-line title'), {
        target: { value: 'Something worth keeping' },
      });
      // The debounce is deliberately longer than waitFor's default window.
      await waitFor(
        () =>
          expect(onSaveStatusChange).toHaveBeenCalledWith(
            expect.stringContaining('Draft saved'),
          ),
        { timeout: 4000 },
      );
    });

    it('saves and leaves when the writer takes the explicit way out', async () => {
      renderWithIntl(<CardEditor locale="en" />);
      fireEvent.change(screen.getByLabelText('One-line title'), {
        target: { value: 'Enough for today' },
      });
      // The page's way out is quiet text beside the one verb (Publish).
      expect(screen.getByRole('button', { name: 'Save draft and leave' })).toHaveAttribute('data-variant', 'text');
      await userEvent.click(screen.getByRole('button', { name: 'Save draft and leave' }));

      await waitFor(() =>
        expect(createCardDraft).toHaveBeenCalledWith(
          expect.objectContaining({ thoughtCore: 'Enough for today' }),
        ),
      );
      expect(back).toHaveBeenCalled();
      // Leaving a draft is never publishing it.
      expect(publishCard).not.toHaveBeenCalled();
    });
  });

  // Revising something people can already read is a different job from writing
  // a draft: autosave must not push half-written sentences to readers, and the
  // save must not re-publish (which would re-date the card).
  describe('editing a published card', () => {
    it('buffers autosaved edits privately instead of writing them live', async () => {
      const onSaveStatusChange = vi.fn();
      renderWithIntl(
        <CardEditor locale="en" initial={livePost} onSaveStatusChange={onSaveStatusChange} />,
      );
      await waitFor(() =>
        expect(onSaveStatusChange).toHaveBeenCalledWith(en.write.editLiveHint),
      );

      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'A rewrite, mid-sentence and not ready for' },
      });

      await waitFor(
        () =>
          expect(savePendingCardEdit).toHaveBeenCalledWith(
            'card-1',
            expect.objectContaining({ story: 'A rewrite, mid-sentence and not ready for' }),
          ),
        { timeout: 4000 },
      );
      // The live document — the one readers are looking at — stays untouched.
      expect(updateCardDraft).not.toHaveBeenCalled();
      expect(publishCard).not.toHaveBeenCalled();
      await waitFor(
        () =>
          expect(onSaveStatusChange).toHaveBeenCalledWith(
            expect.stringContaining('readers still see the old version'),
          ),
        { timeout: 4000 },
      );
    });

    it('applies the revision — without re-publishing — when the author saves', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal('fetch', fetchMock);
      try {
        renderWithIntl(<CardEditor locale="en" initial={livePost} />);
        fireEvent.change(screen.getByLabelText('Story'), {
          target: { value: 'The finished rewrite.' },
        });

        await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
        // The same panel, in update dress: no mirror moment, and it says plainly
        // what the button is about to do.
        expect(await screen.findByText(en.write.publishPanel.updateTitle)).toBeInTheDocument();
        expect(screen.getByText(en.write.publishPanel.updateHint)).toBeInTheDocument();

        const buttons = screen.getAllByRole('button', { name: 'Save changes' });
        await userEvent.click(buttons[buttons.length - 1]);

        await waitFor(() =>
          expect(applyPendingCardEdit).toHaveBeenCalledWith(
            'card-1',
            expect.objectContaining({ story: 'The finished rewrite.' }),
          ),
        );
        expect(publishCard).not.toHaveBeenCalled();
        await waitFor(() => expect(push).toHaveBeenCalledWith('/card/a-quiet-thought'));
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('discards a buffered revision and returns to the untouched card', async () => {
      renderWithIntl(
        <CardEditor locale="en" initial={{ ...livePost, hasPendingEdit: true }} />,
      );
      expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'text');
      await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

      await waitFor(() => expect(discardPendingCardEdit).toHaveBeenCalledWith('card-1'));
      expect(updateCardDraft).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith('/card/a-quiet-thought');
    });

    it('offers nothing to discard when there is no buffered revision', () => {
      renderWithIntl(<CardEditor locale="en" initial={livePost} />);
      expect(
        screen.queryByRole('button', { name: 'Discard changes' }),
      ).not.toBeInTheDocument();
    });
  });
});
