// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithIntl, screen, waitFor, fireEvent, userEvent } from '@/../test/render';
import { NoteComposer, NOTE_UPGRADE_THRESHOLD } from './NoteComposer';

vi.mock('@/lib/db/firestore/client/notes', () => ({
  sendNote: vi.fn(),
  NOTE_MAX_LENGTH: 2000,
}));
const mockUseMyProfile = vi.fn();
vi.mock('@/lib/data/hooks', () => ({
  useMyProfile: () => mockUseMyProfile(),
}));
vi.mock('@/lib/hints', () => ({
  useHint: () => ({ visible: true, dismiss: vi.fn() }),
}));

import { sendNote } from '@/lib/db/firestore/client/notes';

beforeEach(() => {
  mockUseMyProfile.mockReturnValue({ data: { id: 'me', handle: 'my-handle' } });
  vi.mocked(sendNote).mockResolvedValue('note-1');
});
afterEach(() => vi.clearAllMocks());

// The Send button sits in a pointer-events-gated wrapper while invalid.
const user = () => userEvent.setup({ pointerEventsCheck: 0 });

describe('NoteComposer', () => {
  it('shows the privacy micro-hint and sends a note to the author', async () => {
    renderWithIntl(<NoteComposer cardId="c1" toUserId="author-1" />);

    expect(screen.getByText('Only the author can see this.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Something you want to tell the author…'), {
      target: { value: 'Your story stayed with me all day.' },
    });
    await user().click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(sendNote).toHaveBeenCalledWith({
        cardId: 'c1',
        toUserId: 'author-1',
        text: 'Your story stayed with me all day.',
        fromHandle: 'my-handle',
      }),
    );
    // Confirmation replaces the form.
    expect(await screen.findByText('Your note is on its way.')).toBeInTheDocument();
  });

  it('does not send an empty note', async () => {
    renderWithIntl(<NoteComposer cardId="c1" toUserId="author-1" />);
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(sendNote).not.toHaveBeenCalled();
  });

  it('offers the resonance upgrade only past the length threshold, carrying the text', async () => {
    const onUpgrade = vi.fn();
    renderWithIntl(<NoteComposer cardId="c1" toUserId="author-1" onUpgrade={onUpgrade} />);
    const box = screen.getByPlaceholderText('Something you want to tell the author…');

    fireEvent.change(box, { target: { value: 'short note' } });
    expect(
      screen.queryByRole('button', { name: 'Want to turn this into a resonance card?' }),
    ).not.toBeInTheDocument();

    const long = 'a'.repeat(NOTE_UPGRADE_THRESHOLD + 1);
    fireEvent.change(box, { target: { value: long } });
    await user().click(
      screen.getByRole('button', { name: 'Want to turn this into a resonance card?' }),
    );
    expect(onUpgrade).toHaveBeenCalledWith(long);
    expect(sendNote).not.toHaveBeenCalled();
  });
});
