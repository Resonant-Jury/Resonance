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
import { ApiError } from '@/lib/db/firestore/client/api';

beforeEach(() => {
  mockUseMyProfile.mockReturnValue({ data: { id: 'me', handle: 'my-handle' } });
  vi.mocked(sendNote).mockResolvedValue('note-1');
});
afterEach(() => vi.clearAllMocks());

// The Send button sits in a pointer-events-gated wrapper while invalid.
const user = () => userEvent.setup({ pointerEventsCheck: 0 });

describe('NoteComposer', () => {
  it('shows the privacy micro-hint and sends a note to the author', async () => {
    renderWithIntl(<NoteComposer cardId="c1" />);

    expect(screen.getByText('Only the author can see this.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Something you want to tell the author…'), {
      target: { value: 'Your story stayed with me all day.' },
    });
    await user().click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(sendNote).toHaveBeenCalledWith({
        cardId: 'c1',
        text: 'Your story stayed with me all day.',
      }),
    );
    // Confirmation replaces the form.
    expect(await screen.findByText('Your note is on its way.')).toBeInTheDocument();
  });

  // The composer sits in a panel (or a modal): Send is a solid fill and
  // cancel plain text, so neither adds a pen line to the frame around them.
  it('sends with a solid verb beside a plain-text cancel', async () => {
    const onClose = vi.fn();
    renderWithIntl(<NoteComposer cardId="c1" onClose={onClose} />);

    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('data-variant', 'solid');
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('data-variant', 'text');
    await user().click(cancel);
    expect(onClose).toHaveBeenCalled();
    expect(sendNote).not.toHaveBeenCalled();
  });

  // A letter holds three notes until the author answers; the fourth is refused, said in the reader's words.
  it('asks the writer to wait for an answer when their letter is full, and never shows the server’s words', async () => {
    vi.mocked(sendNote).mockRejectedValueOnce(new ApiError(409, 'conflict', 'Wait for them to reply.'));
    renderWithIntl(<NoteComposer cardId="c1" />);
    fireEvent.change(screen.getByPlaceholderText('Something you want to tell the author…'), { target: { value: 'One more thing' } });
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("You've left notes they haven't answered yet — wait for their reply.")).toBeInTheDocument();
    expect(screen.queryByText('Wait for them to reply.')).not.toBeInTheDocument();
    expect(screen.queryByText('Your note is on its way.')).not.toBeInTheDocument();

    vi.mocked(sendNote).mockRejectedValueOnce(new ApiError(403, 'blocked', 'You cannot send a note to this person.'));
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("Couldn't send — please try again.")).toBeInTheDocument();
    expect(screen.queryByText('You cannot send a note to this person.')).not.toBeInTheDocument();
  });

  it('does not send an empty note', async () => {
    renderWithIntl(<NoteComposer cardId="c1" />);
    await user().click(screen.getByRole('button', { name: 'Send' }));
    expect(sendNote).not.toHaveBeenCalled();
  });

  it('offers the resonance upgrade only past the length threshold, carrying the text', async () => {
    const onUpgrade = vi.fn();
    renderWithIntl(<NoteComposer cardId="c1" onUpgrade={onUpgrade} />);
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
