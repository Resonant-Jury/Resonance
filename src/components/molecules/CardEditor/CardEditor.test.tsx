// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

import { createCardDraft, publishCard } from '@/lib/db/firestore/client/cards';

beforeEach(() => {
  vi.mocked(createCardDraft).mockResolvedValue({ id: 'draft-1' } as never);
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

      // The editor's publish button opens the single-screen panel — nothing is
      // saved yet.
      await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
      expect(createCardDraft).not.toHaveBeenCalled();
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

      await waitFor(() =>
        expect(createCardDraft).toHaveBeenCalledWith(
          expect.objectContaining({ anonymous: true })
        )
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe('Navigation Guard', () => {
    it('does not trigger confirmation dialog if editor is clean', () => {
      renderWithIntl(<CardEditor locale="en" />);
      
      const anchor = document.createElement('a');
      anchor.setAttribute('href', '/home');
      document.body.appendChild(anchor);
      
      fireEvent.click(anchor);
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();
      document.body.removeChild(anchor);
    });

    it('intercepts anchor click and shows confirmation modal when dirty', async () => {
      renderWithIntl(<CardEditor locale="en" />);
      
      // Make it dirty by typing
      fireEvent.change(screen.getByLabelText('One-line title'), { target: { value: 'Dirty title' } });

      const anchor = document.createElement('a');
      anchor.setAttribute('href', '/home');
      document.body.appendChild(anchor);

      fireEvent.click(anchor);
      expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();

      // Click cancel should close modal
      await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
      expect(screen.queryByText('Discard unsaved changes?')).not.toBeInTheDocument();

      // Click discard should close modal and navigate (which pushes to router)
      fireEvent.click(anchor);
      expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
      expect(push).toHaveBeenCalledWith('/home');

      document.body.removeChild(anchor);
    });
  });
});
