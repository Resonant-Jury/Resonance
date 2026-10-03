// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRef } from 'react';
import { act } from '@testing-library/react';
import { renderWithIntl, screen, fireEvent, waitFor, userEvent } from '@/../test/render';
import en from '@/messages/en.json';
import { CardEditor, type CardEditorHandle } from './CardEditor';

const push = vi.fn();
const back = vi.fn();
const replace = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push, back, replace }),
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
  vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-quiet-thought', applied: true });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

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
      await userEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
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

  it('turns the tag field\'s action from AI into Add while a tag is being typed', async () => {
    renderWithIntl(<CardEditor locale="en" />);
    const input = screen.getByLabelText('Type a tag…');

    // One trailing action: with nothing typed it asks the model…
    expect(screen.getByRole('button', { name: 'Suggest with AI' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();

    // …with something typed it adds that tag instead.
    fireEvent.change(input, { target: { value: '旅行' } });
    expect(screen.queryByRole('button', { name: 'Suggest with AI' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('旅行')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Suggest with AI' })).toBeInTheDocument();
  });

  it('adds a typed tag on Enter and keeps the text it was typed with', async () => {
    renderWithIntl(<CardEditor locale="en" />);
    const input = screen.getByLabelText('Type a tag…');

    fireEvent.change(input, { target: { value: '  旅行 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(screen.getByText('旅行')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(screen.getByText('Press Enter to add one, or let AI suggest from your story')).toBeInTheDocument();
  });

  it('keeps a tag typed while the model is still thinking when its suggestions arrive', async () => {
    let answer: (v: unknown) => void = () => undefined;
    const fetchMock = vi.fn().mockReturnValue(new Promise((resolve) => (answer = resolve)));
    vi.stubGlobal('fetch', fetchMock);
    try {
      renderWithIntl(<CardEditor locale="en" />);
      await userEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
      // The field is still usable while the model thinks.
      expect(screen.getByRole('button', { name: 'Thinking…' })).toBeInTheDocument();
      const input = screen.getByLabelText('Type a tag…');
      fireEvent.change(input, { target: { value: '旅行' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      answer({ ok: true, json: async () => ({ tags: ['記憶', '旅行'] }) });
      await waitFor(() => expect(screen.getByText('記憶')).toBeInTheDocument());
      // Neither lost nor doubled.
      expect(screen.getAllByText('旅行')).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a failed suggestion in place of the helper line', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderWithIntl(<CardEditor locale="en" />);
      await userEvent.click(screen.getByRole('button', { name: 'Suggest with AI' }));
      expect(await screen.findByText('Couldn’t suggest tags. Please try again.')).toBeInTheDocument();
      expect(screen.queryByText('Press Enter to add one, or let AI suggest from your story')).not.toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
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
      // Before anything is saved there is nothing to say.
      await waitFor(() => expect(onSaveStatusChange).toHaveBeenCalledWith(null));

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
      // A writer opened in a tab of its own has nothing to go back to: the card box, where the draft now is.
      expect(replace).toHaveBeenCalledWith('/me');
      // Leaving a draft is never publishing it.
      expect(publishCard).not.toHaveBeenCalled();

      // Come from another page of the site, it goes back there.
      window.history.pushState({}, '', window.location.href);
      fireEvent.change(screen.getByLabelText('One-line title'), { target: { value: 'Enough for today, really' } });
      await userEvent.click(screen.getByRole('button', { name: 'Save draft and leave' }));
      await waitFor(() => expect(back).toHaveBeenCalled());
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

    /** Opens the update panel from the editor and confirms it. */
    async function saveChanges() {
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText(en.write.publishPanel.updateTitle);
      const buttons = screen.getAllByRole('button', { name: 'Save changes' });
      await user.click(buttons[buttons.length - 1]);
    }

    // The server applies what the buffer holds (POST …/edits/apply, as the
    // apps do), so the copy on screen must be in the buffer first — written
    // after any autosave still in flight, and before the apply is asked for.
    it('saves the working copy, then has the server apply it — without re-publishing', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false });
      vi.stubGlobal('fetch', fetchMock);
      try {
        let release!: () => void;
        vi.mocked(savePendingCardEdit).mockImplementationOnce(
          () => new Promise<void>((resolve) => (release = resolve)),
        );
        const user = userEvent.setup();
        renderWithIntl(<CardEditor locale="en" initial={livePost} />);
        fireEvent.change(screen.getByLabelText('Story'), {
          target: { value: 'The finished rewrite.' },
        });

        await user.click(screen.getByRole('button', { name: 'Save changes' }));
        // The same panel, in update dress: no mirror moment, and it says plainly
        // what the button is about to do.
        expect(await screen.findByText(en.write.publishPanel.updateTitle)).toBeInTheDocument();
        expect(screen.getByText(en.write.publishPanel.updateHint)).toBeInTheDocument();
        // What the panel decides is part of the revision.
        await user.click(screen.getByRole('button', { name: 'Only me' }));
        await user.click(screen.getByRole('switch', { name: 'Publish anonymously' }));
        const buttons = screen.getAllByRole('button', { name: 'Save changes' });
        await user.click(buttons[buttons.length - 1]);

        await waitFor(() =>
          expect(savePendingCardEdit).toHaveBeenLastCalledWith(
            'card-1',
            expect.objectContaining({ story: 'The finished rewrite.', visibility: 'private', anonymous: true }),
          ),
        );
        // Not applied until the buffer holds it.
        expect(applyPendingCardEdit).not.toHaveBeenCalled();
        await act(async () => release());

        await waitFor(() => expect(push).toHaveBeenCalledWith('/card/a-quiet-thought'));
        // The id is all it sends: the server reads the buffer, never the browser's say-so.
        expect(applyPendingCardEdit).toHaveBeenCalledTimes(1);
        expect(applyPendingCardEdit).toHaveBeenCalledWith('card-1');
        expect(publishCard).not.toHaveBeenCalled();
        expect(updateCardDraft).not.toHaveBeenCalled();
        // The pages and the recommendation index are refreshed by the server.
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('goes to the card where the server says it lives', async () => {
      // Its slug was written after the page that opened the editor was read.
      vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-later-slug', applied: true });
      renderWithIntl(<CardEditor locale="en" initial={{ ...livePost, slug: undefined }} />);
      await saveChanges();
      await waitFor(() => expect(push).toHaveBeenCalledWith('/card/a-later-slug'));
    });

    it('keeps the editor and the buffered text when the server refuses the revision', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.mocked(applyPendingCardEdit).mockRejectedValue(new Error('The edit does not fit a card.'));
      renderWithIntl(<CardEditor locale="en" initial={livePost} />);
      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'A rewrite the server turns down.' },
      });
      await saveChanges();

      expect(await screen.findByText('The edit does not fit a card.')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Story')).toHaveValue('A rewrite the server turns down.');
      // The text is in the buffer, so leaving loses nothing — and there is
      // now something to discard.
      expect(savePendingCardEdit).toHaveBeenLastCalledWith(
        'card-1',
        expect.objectContaining({ story: 'A rewrite the server turns down.' }),
      );
      expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    });

    it('keeps the text when there was nothing left to apply, and writes it again on the way out', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      // Applied or discarded elsewhere between the save and the apply.
      vi.mocked(applyPendingCardEdit).mockResolvedValue({ id: 'card-1', slug: 'a-quiet-thought', applied: false });
      const { unmount } = renderWithIntl(<CardEditor locale="en" initial={livePost} />);
      fireEvent.change(screen.getByLabelText('Story'), {
        target: { value: 'Words that must not vanish.' },
      });
      await saveChanges();

      expect(await screen.findByText('Changes were not applied')).toBeInTheDocument();
      expect(push).not.toHaveBeenCalled();
      const saves = vi.mocked(savePendingCardEdit).mock.calls.length;
      unmount();
      await waitFor(() => expect(savePendingCardEdit).toHaveBeenCalledTimes(saves + 1));
      expect(savePendingCardEdit).toHaveBeenLastCalledWith(
        'card-1',
        expect.objectContaining({ story: 'Words that must not vanish.' }),
      );
    });

    it('asks for a title instead of sending an untitled revision', async () => {
      renderWithIntl(<CardEditor locale="en" initial={livePost} />);
      fireEvent.change(screen.getByLabelText('One-line title'), { target: { value: '  ' } });
      await saveChanges();

      expect(await screen.findByText(en.write.titleRequired)).toBeInTheDocument();
      expect(applyPendingCardEdit).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
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

  // The writer's back arrow asks before leaving written work (the apps'
  // holdsWork, rule for rule) and saves it first rather than leaving it to
  // the debounce.
  describe('what leaving would leave behind', () => {
    it('holds nothing while a new card is blank, and work once something is written', async () => {
      const editor = createRef<CardEditorHandle>();
      renderWithIntl(<CardEditor locale="en" ref={editor} />);
      expect(editor.current!.hasWork()).toBe(false);

      fireEvent.change(screen.getByLabelText('One-line title'), { target: { value: 'Half a thought' } });
      expect(editor.current!.hasWork()).toBe(true);
      // Kept now, and still asked about: it is a draft with words in it.
      await act(() => editor.current!.saveNow());
      expect(editor.current!.hasWork()).toBe(true);
    });

    // The first-card guide's question is the starting point, not writing:
    // nothing keeps it until the writer adds to it.
    it('does not count words the first-card guide seeded', async () => {
      const editor = createRef<CardEditorHandle>();
      renderWithIntl(<CardEditor locale="en" ref={editor} initial={{ story: '> What changed?\n\n' }} />);
      expect(editor.current!.hasWork()).toBe(false);

      fireEvent.change(screen.getByLabelText('Story'), { target: { value: '> What changed?\n\nThe light did.' } });
      expect(editor.current!.hasWork()).toBe(true);
      await act(() => editor.current!.saveNow());
    });

    it('holds a kept draft with words in it, even untouched — but not an empty one', () => {
      const kept = createRef<CardEditorHandle>();
      const { unmount } = renderWithIntl(
        <CardEditor locale="en" ref={kept} initial={{ id: 'draft-9', thoughtCore: 'Kept for later' }} />,
      );
      expect(kept.current!.hasWork()).toBe(true);
      unmount();

      const empty = createRef<CardEditorHandle>();
      renderWithIntl(<CardEditor locale="en" ref={empty} initial={{ id: 'draft-9' }} />);
      expect(empty.current!.hasWork()).toBe(false);
    });

    it('holds a live card\'s revision, buffered or typed, and nothing when it is untouched', () => {
      const untouched = createRef<CardEditorHandle>();
      const { unmount } = renderWithIntl(<CardEditor locale="en" ref={untouched} initial={livePost} />);
      expect(untouched.current!.hasWork()).toBe(false);
      fireEvent.change(screen.getByLabelText('Story'), { target: { value: 'A second look.' } });
      expect(untouched.current!.hasWork()).toBe(true);
      unmount();

      const buffered = createRef<CardEditorHandle>();
      renderWithIntl(<CardEditor locale="en" ref={buffered} initial={{ ...livePost, hasPendingEdit: true }} />);
      expect(buffered.current!.hasWork()).toBe(true);
    });

    it('writes what is not saved yet when asked, and nothing when it is', async () => {
      const editor = createRef<CardEditorHandle>();
      renderWithIntl(<CardEditor locale="en" ref={editor} />);
      await act(() => editor.current!.saveNow());
      expect(createCardDraft).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText('One-line title'), { target: { value: 'Before I go' } });
      await act(() => editor.current!.saveNow());
      expect(createCardDraft).toHaveBeenCalledTimes(1);
      expect(createCardDraft).toHaveBeenCalledWith(expect.objectContaining({ thoughtCore: 'Before I go' }));

      await act(() => editor.current!.saveNow());
      expect(createCardDraft).toHaveBeenCalledTimes(1);
      expect(updateCardDraft).not.toHaveBeenCalled();
    });
  });
});
