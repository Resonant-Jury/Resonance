// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, loading: false }),
}));
vi.mock('@/lib/db/firestore/client/reads', () => ({ getCardsByAuthor: vi.fn() }));

import { getCardsByAuthor } from '@/lib/db/firestore/client/reads';
import { InsertCardModal } from './InsertCardModal';

afterEach(() => vi.clearAllMocks());

describe('InsertCardModal', () => {
  // (The pick list itself needs real layout for its scrollbar; the picker's
  // chrome — the one button it adds — is what this pins.)
  it('leaves through a plain-text cancel', async () => {
    vi.mocked(getCardsByAuthor).mockResolvedValue([]);
    const onClose = vi.fn();
    renderWithIntl(<InsertCardModal open onClose={onClose} onPick={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('You have no public cards yet.')).toBeInTheDocument());

    // The modal is the frame, so the only button it adds draws no outline.
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveAttribute('data-variant', 'text');
    await userEvent.click(cancel);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
