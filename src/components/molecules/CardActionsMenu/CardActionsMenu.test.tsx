// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { CardActionsMenu } from './CardActionsMenu';

const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

const mockUpdate = vi.fn().mockResolvedValue({});
const mockDelete = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/db/firestore/client/cards', () => ({
  updateCardDraft: (...args: unknown[]) => mockUpdate(...args),
  deleteCardDraft: (...args: unknown[]) => mockDelete(...args),
}));

const mockRevalidate = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/db/firestore/client/revalidate', () => ({
  requestRevalidate: (...args: unknown[]) => mockRevalidate(...args),
}));

describe('CardActionsMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the menu and navigates to the editor on Edit', async () => {
    renderWithIntl(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} />);

    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    await userEvent.click(screen.getByText('Edit'));
    expect(mockPush).toHaveBeenCalledWith('/write/c1');
  });

  it('toggles a public card to private and busts the card page cache', async () => {
    const onChanged = vi.fn();
    renderWithIntl(
      <CardActionsMenu
        card={{ id: 'c1', visibility: 'public', slug: 'my-card' }}
        onChanged={onChanged}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c1', { visibility: 'private' }));
    expect(onChanged).toHaveBeenCalled();
    // Visibility decides what the share metadata may reveal — the ISR entry
    // for the card page (keyed by slug) must be revalidated on the spot.
    expect(mockRevalidate).toHaveBeenCalledWith(['/card/my-card']);
    // The menu closes after the change lands.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Make public on a private card', async () => {
    renderWithIntl(<CardActionsMenu card={{ id: 'c2', visibility: 'private' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make public'));

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('c2', { visibility: 'public' }));
  });

  it('asks for confirmation before deleting, and deletes on confirm', async () => {
    const onDeleted = vi.fn();
    renderWithIntl(
      <CardActionsMenu card={{ id: 'c3', visibility: 'public' }} onDeleted={onDeleted} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    // Nothing deleted yet — the confirm dialog is showing instead.
    expect(mockDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this card?')).toBeInTheDocument();

    await userEvent.click(screen.getByText('Delete card'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('c3'));
    expect(onDeleted).toHaveBeenCalled();
    // Without a slug the cache path falls back to the doc id.
    expect(mockRevalidate).toHaveBeenCalledWith(['/card/c3']);
  });

  it('keeps the card when the confirm dialog is cancelled', async () => {
    renderWithIntl(<CardActionsMenu card={{ id: 'c4', visibility: 'public' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Keep it'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
