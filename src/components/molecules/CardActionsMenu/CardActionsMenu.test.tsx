// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { ReactNode } from 'react';
import useSWR, { SWRConfig } from 'swr';
import { renderWithIntl, screen, userEvent, waitFor } from '@/../test/render';
import { CardActionsMenu } from './CardActionsMenu';

// The owner's「⋯」on a card, on the real client card writes: the v1 API call
// (callApi), the signed-in user and navigation are the module boundary.
const mockPush = vi.fn();
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/lib/auth/firebase/client', () => ({
  getFirebaseClientAuth: () => ({ currentUser: { uid: 'u1', getIdToken: async () => 'token' } }),
}));

const mockCallApi = vi.fn();
vi.mock('@/lib/db/firestore/client/api', () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

/** What else this browser holds of the viewer's cards: their card box and their profile's lists. */
const boxReads = vi.fn(async () => ['c1']);
const profileReads = vi.fn(async () => ['c1']);
function OwnLists() {
  useSWR('cardbox:u1', boxReads);
  useSWR('profilePage:me:u1', profileReads);
  return null;
}

function renderMenu(menu: ReactNode) {
  return renderWithIntl(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <OwnLists />
      {menu}
    </SWRConfig>,
  );
}

describe('CardActionsMenu', () => {
  let fetchSpy: MockInstance<typeof fetch>;
  beforeEach(() => {
    vi.clearAllMocks();
    mockCallApi.mockResolvedValue({});
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    return () => fetchSpy.mockRestore();
  });

  it('opens the menu and navigates to the editor on Edit', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} />);

    expect(screen.queryByRole('menu')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);

    await userEvent.click(screen.getByText('Edit'));
    expect(mockPush).toHaveBeenCalledWith('/write/c1');
  });

  it('makes a public card private through the server, then reads the card box and profile lists again', async () => {
    const onChanged = vi.fn();
    renderMenu(<CardActionsMenu card={{ id: 'c1', visibility: 'public' }} onChanged={onChanged} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make private'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c1', { method: 'PATCH', body: { visibility: 'private' } }),
    );
    expect(onChanged).toHaveBeenCalled();
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    expect(profileReads).toHaveBeenCalledTimes(2);
    // The server drops the cached pages itself: the browser asks for nothing more.
    expect(fetchSpy).not.toHaveBeenCalled();
    // The menu closes after the change lands.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('offers Make public on a private card', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c2', visibility: 'private' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Make public'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c2', { method: 'PATCH', body: { visibility: 'public' } }),
    );
  });

  it('asks for confirmation before deleting, and deletes through the server on confirm', async () => {
    const onDeleted = vi.fn();
    renderMenu(<CardActionsMenu card={{ id: 'c3', visibility: 'public' }} onDeleted={onDeleted} />);
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));

    // Nothing deleted yet — the confirm dialog is showing instead.
    expect(mockCallApi).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete this card?')).toBeInTheDocument();

    // Deleting can't be undone: the verb is red, "keep it" plain text, and
    // neither draws a pen line inside the modal's own frame.
    expect(screen.getByRole('button', { name: 'Delete card' })).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByRole('button', { name: 'Keep it' })).toHaveAttribute('data-variant', 'text');

    await userEvent.click(screen.getByText('Delete card'));
    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/v1/cards/c3', { method: 'DELETE' }));
    expect(onDeleted).toHaveBeenCalled();
    await waitFor(() => expect(boxReads).toHaveBeenCalledTimes(2));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the card when the confirm dialog is cancelled', async () => {
    renderMenu(<CardActionsMenu card={{ id: 'c4', visibility: 'public' }} />);

    await userEvent.click(screen.getByRole('button', { name: 'Manage card' }));
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Keep it'));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockCallApi).not.toHaveBeenCalled();
  });
});
